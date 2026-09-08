/**
 * Tool Manager for handling AI tool calls
 * Provides a flexible framework for registering and executing tools
 */

// Import necessary functions
import { useSettings } from './useSettings';
import { getSessionToken } from './useSession';
import { emitter } from './emitter';
import {
  runInSandboxWorker,
  clampSandboxTimeout,
  SANDBOX_MAX_TIMEOUT_MS,
  capText,
  SANDBOX_RESULT_CAP,
} from '~/utils/sandbox';
import {
  workspaceRead,
  workspaceWrite,
  workspaceList,
  workspaceDelete,
  workspaceMove,
  workspaceSearch,
  workspaceAppend,
  computeEdit,
  ensureWorkspaceSeeded,
  buildWorkspaceManifest,
  WORKSPACE_MAX_ENTRIES,
} from '~/utils/workspace';
import {
  isFileToolsAvailable,
  resolveScopePath,
  getChatRoot,
  getProjectRoot,
  getScopeSummary,
  listProjectNames,
} from './workspaceSession';
import { sandboxNetFetch } from './sandboxNet';

function requireFileTools() {
  if (!isFileToolsAvailable()) {
    throw new Error(
      'File tools are unavailable in incognito mode — this chat is not stored, so it cannot have files.',
    );
  }
}

/** Resolves a model path against the active conversation scope. */
async function scoped(p) {
  const resolved = await resolveScopePath(p);
  return { ...resolved };
}

function notifyWorkspaceChanged() {
  emitter.emit('workspace-changed', { at: Date.now() });
}

/** Scoped fs bridge handed to the sandbox worker. */
async function scopedFsBridge() {
  return {
    // Returns the raw TEXT (not a wrapper object) — sandboxed code should
    // be able to do `const src = await workspace.read(path)` directly.
    read: async (p) => {
      const s = await scoped(p);
      return (await workspaceRead(s.rel, s.root)).content;
    },
    write: async (p, c) => {
      const s = await scoped(p);
      const out = await workspaceWrite(s.rel, c, s.root);
      notifyWorkspaceChanged();
      return out;
    },
    append: async (p, c) => {
      const s = await scoped(p);
      const out = await workspaceAppend(s.rel, c, s.root);
      notifyWorkspaceChanged();
      return out;
    },
    list: async (p) => {
      const s = p ? await scoped(p) : { root: await getChatRoot(), rel: '' };
      return workspaceList(s.rel, s.root);
    },
    net: sandboxNetFetch,
  };
}

/**
 * Headers for calling session-guarded server routes (search, contents).
 */
async function guardedHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-session-token': await getSessionToken(),
    ...extra,
  };
}

class ToolManager {
  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * Register a new tool
   * @param {string} name - The tool name
   * @param {Function} executor - Function that executes the tool with parameters
   * @param {Object} schema - Tool schema definition in OpenAI format
   */
  registerTool(name, executor, schema) {
    this.tools.set(name, { executor, schema });
  }

  /**
   * Unregister a tool
   * @param {string} name - The tool name to remove
   */
  unregisterTool(name) {
    this.tools.delete(name);
  }

  /**
   * Get all registered tools' schemas for API requests
   */
  getToolSchemas() {
    return Array.from(this.tools.values()).map(tool => tool.schema);
  }

  /**
   * Get a specific tool
   */
  getTool(name) {
    return this.tools.get(name);
  }

  /**
   * Execute a tool with given arguments
   * @param {string} name - Tool name
   * @param {Object} args - Arguments for the tool
   * @returns {Promise<any>} - Tool execution result
   */
  async executeTool(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }

    try {
      return await tool.executor(args);
    } catch (error) {
      console.error(`Error executing tool "${name}":`, error);
      throw error;
    }
  }

  /**
   * Get schemas for specific tool names
   */
  getSchemasByNames(names = []) {
    return names
      .map(name => this.tools.get(name))
      .filter(Boolean)
      .map(tool => tool.schema);
  }

  /**
   * Get all tool names
   */
  getToolNames() {
    return Array.from(this.tools.keys());
  }

  /**
   * Get the custom API key from settings
   */
  getApiKey() {
    // Try to get from settings manager if available
    if (typeof window !== 'undefined') {
      const settingsManager = useSettings();
      return settingsManager.settings?.custom_api_key;
    }
    return null;
  }

  /**
   * Resolve where the Exa-backed tools should run and which key they use.
   *   - 'hackclub': bundled with the user's Hack Club AI key (default)
   *   - 'exa': the user's own Exa API key, direct against api.exa.ai
   *   - 'off': search tools are disabled entirely
   * @returns {{source: string, apiKey: string|null}}
   */
  getSearchConfig() {
    if (typeof window !== 'undefined') {
      const settings = useSettings().settings;
      const source = settings?.tool_search_source || 'hackclub';
      const apiKey =
        source === 'exa'
          ? settings?.exa_api_key
          : settings?.custom_api_key;
      return { source, apiKey: apiKey || null };
    }
    return { source: 'off', apiKey: null };
  }

  /**
   * Register default tools
   */
  registerDefaultTools() {
    // Exa Search Tool - calls server route with API key
    this.registerTool(
      'search',
      async (args) => {
        if (!args.q) {
          throw new Error('Search tool requires a "q" (query) argument');
        }

        const { source, apiKey } = this.getSearchConfig();
        if (source === 'off') {
          throw new Error('Search is disabled in settings');
        }
        if (!apiKey) {
          throw new Error(
            source === 'exa'
              ? 'An Exa API key is required for search (Settings → Search & Tools)'
              : 'API key is required for search'
          );
        }

        try {
          const params = new URLSearchParams({
            q: args.q,
            numResults: args.numResults || 5,
            source
          });

          const response = await fetch(`/api/search?${params.toString()}`, {
            headers: await guardedHeaders({
              'X-API-Key': apiKey
            })
          });

          if (!response.ok) {
            throw new Error(`Search request failed with status ${response.status}`);
          }

          const data = await response.json();

          // Format results for the AI
          if (!data.results || data.results.length === 0) {
            return {
              results: [],
              message: "No results found for query."
            };
          }

          return {
            results: data.results.map(r => ({
              title: r.title,
              url: r.url,
              highlights: r.highlights,
              author: r.author,
              date: r.date,
              subpages: r.subpages
            })),
            query: args.q
          };

        } catch (error) {
          console.error("Search tool error:", error);
          throw error;
        }
      },
      {
        type: "function",
        function: {
          name: "search",
          description: "Search the web for current information, news, or specific topics using Exa AI search. Use this when you need information beyond your knowledge cutoff.",
          parameters: {
            type: "object",
            properties: {
              q: {
                type: "string",
                description: "The search query"
              },
              numResults: {
                type: "integer",
                description: "Number of results to return (default 5, max 10)",
                maximum: 10
              }
            },
            required: ["q"]
          }
        }
      }
    );

    // Exa Page Contents Tool - calls server route with API key
    this.registerTool(
      'getPageContents',
      async (args) => {
        if (!args.urls || !Array.isArray(args.urls) || args.urls.length === 0) {
          throw new Error('getPageContents tool requires a "urls" array argument');
        }

        const { source, apiKey } = this.getSearchConfig();
        if (source === 'off') {
          throw new Error('Search is disabled in settings');
        }
        if (!apiKey) {
          throw new Error(
            source === 'exa'
              ? 'An Exa API key is required for page contents (Settings → Search & Tools)'
              : 'API key is required for page contents'
          );
        }

        try {
          const response = await fetch('/api/exa-contents', {
            method: 'POST',
            headers: await guardedHeaders({
              'X-API-Key': apiKey
            }),
            body: JSON.stringify({
              urls: args.urls.slice(0, 10), // Limit to 10 URLs
              source
            })
          });

          if (!response.ok) {
            throw new Error(`Page contents request failed with status ${response.status}`);
          }

          const data = await response.json();

          // Format results for the AI
          if (!data.results || data.results.length === 0) {
            return {
              results: [],
              message: "Could not retrieve content for the provided URLs."
            };
          }

          return {
            results: data.results.map(r => ({
              url: r.url,
              title: r.title,
              content: r.content,
              publishedDate: r.publishedDate
            }))
          };

        } catch (error) {
          console.error("Page contents tool error:", error);
          throw error;
        }
      },
      {
        type: "function",
        function: {
          name: "getPageContents",
          description: "Retrieve the full content of web pages using Exa AI. Use this to get detailed information from specific URLs found via search or provided by the user. Can fetch up to 10 pages at once.",
          parameters: {
            type: "object",
            properties: {
              urls: {
                type: "array",
                description: "Array of URLs to fetch content from (max 10)",
                items: {
                  type: "string"
                }
              }
            },
            required: ["urls"]
          }
        }
      }
    );

    // JavaScript execution sandbox - runs model code in a hardened Worker
    this.registerTool(
      'run_javascript',
      async (args) => {
        if (typeof args?.code !== 'string' || !args.code.trim()) {
          throw new Error('run_javascript requires a non-empty "code" string');
        }
        return runInSandboxWorker({
          code: args.code,
          timeoutMs: clampSandboxTimeout(args?.timeout_ms),
          fs: await scopedFsBridge(),
        });
      },
      {
        type: "function",
        function: {
          name: "run_javascript",
          description:
            "Execute JavaScript in a secure sandbox and get the exact result plus captured console output. " +
            "Use it for anything where correctness matters: precise calculations (totals, percentages, ratios, statistics, dates), " +
            "unit and currency conversions, parsing and transforming text or data files (CSV/JSON), and generating documents or tables. " +
            "Top-level await/return supported. " +
            "Raw network access is disabled; use net.fetch(url) for permissioned web requests. A persistent per-conversation " +
            "file workspace is available via workspace.read(path) (returns the file text), workspace.write(path, text), " +
            "workspace.append(path, text), and workspace.list(path).",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description:
                  "JavaScript source to execute. May use top-level await/return, console.log, the workspace API, and net.fetch."
              },
              timeout_ms: {
                type: "integer",
                description: `Optional execution timeout in milliseconds (1000-${SANDBOX_MAX_TIMEOUT_MS}, default 30000).`
              }
            },
            required: ["code"]
          }
        }
      }
    );

    // Workspace: scoped persistent files + shared projects
    this.registerTool(
      'write_file',
      async (args) => {
        requireFileTools();
        if (typeof args?.path !== 'string' || !args.path.trim()) {
          throw new Error('write_file requires a "path" string');
        }
        if (typeof args?.content !== 'string') {
          throw new Error('write_file requires string "content"');
        }
        const s = await scoped(args.path);
        const out = await workspaceWrite(s.rel, args.content, s.root);
        if (s.scope === 'chat') await ensureWorkspaceSeeded(s.root);
        notifyWorkspaceChanged();
        return { ...out, path: s.scope === 'project' ? `projects/${s.projectName}/${out.path}` : out.path };
      },
      {
        type: "function",
        function: {
          name: "write_file",
          description:
            "Create or overwrite a text file in this conversation's workspace — reports, notes, structured data " +
            "(CSV/JSON), saved summaries, or small runnable pages. Parent folders are created automatically. " +
            "Paths starting with projects/<name>/ write into an attached project instead.",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: 'Workspace-relative path, e.g. "reports/summary.md", "data/results.csv", or "projects/my-site/index.html".'
              },
              content: {
                type: "string",
                description: "Full text content to write (existing content is replaced)."
              }
            },
            required: ["path", "content"]
          }
        }
      }
    );

    this.registerTool(
      'read_file',
      async (args) => {
        requireFileTools();
        if (typeof args?.path !== 'string' || !args.path.trim()) {
          throw new Error('read_file requires a "path" string');
        }
        const s = await scoped(args.path);
        const { path, content } = await workspaceRead(s.rel, s.root);
        return {
          path: s.scope === 'project' ? `projects/${s.projectName}/${path}` : path,
          content: capText(content, SANDBOX_RESULT_CAP),
        };
      },
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a text file from this conversation's workspace or an attached project.",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: 'Workspace-relative path, e.g. "data/results.json" or "projects/site/index.html".'
              }
            },
            required: ["path"]
          }
        }
      }
    );

    this.registerTool(
      'append_file',
      async (args) => {
        requireFileTools();
        if (typeof args?.path !== 'string' || !args.path.trim()) {
          throw new Error('append_file requires a "path" string');
        }
        if (typeof args?.content !== 'string') {
          throw new Error('append_file requires string "content"');
        }
        const s = await scoped(args.path);
        const out = await workspaceAppend(s.rel, args.content, s.root);
        notifyWorkspaceChanged();
        return { ...out, appended: true };
      },
      {
        type: "function",
        function: {
          name: "append_file",
          description:
            "Append text to a file (creating it if needed). Prefer this over write_file when building LONG files in several passes.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Workspace-relative path." },
              content: { type: "string", description: "Text to append at the end of the file." }
            },
            required: ["path", "content"]
          }
        }
      }
    );

    this.registerTool(
      'edit_file',
      async (args) => {
        requireFileTools();
        if (typeof args?.path !== 'string' || !args.path.trim()) {
          throw new Error('edit_file requires a "path" string');
        }
        const s = await scoped(args.path);
        const { content: current, path: relPath } = await workspaceRead(s.rel, s.root);
        const result = computeEdit(current, args.old_text, args.new_text ?? "");
        if (!result.ok) throw new Error(result.error);
        await workspaceWrite(s.rel, result.content, s.root);
        notifyWorkspaceChanged();
        return {
          path: s.scope === 'project' ? `projects/${s.projectName}/${relPath}` : relPath,
          edited: true,
          bytesReplaced: new TextEncoder().encode(args.old_text).length,
        };
      },
      {
        type: "function",
        function: {
          name: "edit_file",
          description:
            "Make a targeted edit to an existing file by replacing an exact snippet — much cheaper than rewriting the whole file. " +
            "old_text must match the file content EXACTLY (including whitespace) and should include enough surrounding context to be unambiguous.",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Workspace-relative path of the file to edit."
              },
              old_text: {
                type: "string",
                description: "Exact existing text to replace."
              },
              new_text: {
                type: "string",
                description: "Replacement text (empty string deletes the snippet)."
              }
            },
            required: ["path", "old_text"]
          }
        }
      }
    );

    this.registerTool(
      'delete_file',
      async (args) => {
        requireFileTools();
        if (typeof args?.path !== 'string' || !args.path.trim()) {
          throw new Error('delete_file requires a "path" string');
        }
        const s = await scoped(args.path);
        const out = await workspaceDelete(s.rel, s.root);
        notifyWorkspaceChanged();
        return {
          ...out,
          path: s.scope === 'project' ? `projects/${s.projectName}/${out.path}` : out.path,
        };
      },
      {
        type: "function",
        function: {
          name: "delete_file",
          description:
            "Delete a file or folder from this conversation's workspace (or an attached project). Folders are deleted with all their contents. Prefer asking the user before deleting anything you did not create in this conversation.",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Workspace-relative path to delete."
              }
            },
            required: ["path"]
          }
        }
      }
    );

    this.registerTool(
      'move_file',
      async (args) => {
        requireFileTools();
        if (typeof args?.from !== 'string' || typeof args?.to !== 'string') {
          throw new Error('move_file requires "from" and "to" paths');
        }
        // Both endpoints must resolve within the SAME scope.
        const from = await scoped(args.from);
        const to = await scoped(args.to);
        if (from.scope !== to.scope || from.projectName !== to.projectName) {
          throw new Error("move_file cannot move between different scopes.");
        }
        const out = await workspaceMove(from.rel, to.rel, from.root);
        notifyWorkspaceChanged();
        const prefix = from.scope === 'project' ? `projects/${from.projectName}/` : '';
        return { from: prefix + out.from, to: prefix + out.to };
      },
      {
        type: "function",
        function: {
          name: "move_file",
          description: "Move or rename a file or folder within the workspace.",
          parameters: {
            type: "object",
            properties: {
              from: { type: "string", description: "Current path." },
              to: { type: "string", description: "New path." }
            },
            required: ["from", "to"]
          }
        }
      }
    );

    this.registerTool(
      'rename_file',
      async (args) => {
        requireFileTools();
        if (typeof args?.path !== 'string' || typeof args?.new_name !== 'string' || !args.new_name.trim()) {
          throw new Error('rename_file requires "path" and "new_name"');
        }
        const s = await scoped(args.path);
        const segments = s.rel.split("/");
        segments[segments.length - 1] = args.new_name.trim();
        const out = await workspaceMove(s.rel, segments.join("/"), s.root);
        notifyWorkspaceChanged();
        const prefix = s.scope === 'project' ? `projects/${s.projectName}/` : '';
        return { from: prefix + out.from, to: prefix + out.to };
      },
      {
        type: "function",
        function: {
          name: "rename_file",
          description: "Rename a file or folder in place.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "Current path." },
              new_name: { type: "string", description: "New file or folder name (no path separators)." }
            },
            required: ["path", "new_name"]
          }
        }
      }
    );

    this.registerTool(
      'list_files',
      async (args) => {
        requireFileTools();
        const argPath = typeof args?.path === 'string' ? args.path.trim() : "";
        if (argPath) {
          // Explicit subdirectory → resolve through scope rules as usual.
          const s = await scoped(argPath);
          const listing = await workspaceList(s.rel, s.root);
          if (!listing.truncated && listing.files.length === 0) {
            return { ...listing, message: "No files found." };
          }
          return { ...listing, maxEntries: WORKSPACE_MAX_ENTRIES };
        }
        // Whole-workspace listing: the chat's private root plus every
        // attached project, namespaced under projects/<name>/ so the model
        // can discover — and then directly address — shared files.
        const chatListing = await workspaceList("", await getChatRoot());
        let files = [...chatListing.files];
        let truncated = chatListing.truncated;
        const summary = await getScopeSummary();
        for (const name of summary?.attached ?? []) {
          try {
            const l = await workspaceList("", await getProjectRoot(name));
            files.push(
              ...l.files.map((f) => ({ ...f, path: `projects/${name}/${f.path}` })),
            );
            truncated = truncated || l.truncated;
          } catch {}
        }
        if (files.length > WORKSPACE_MAX_ENTRIES) truncated = true;
        files = files.slice(0, WORKSPACE_MAX_ENTRIES);
        if (!truncated && files.length === 0) {
          return { files, truncated, message: "No files found." };
        }
        return { files, truncated, maxEntries: WORKSPACE_MAX_ENTRIES };
      },
      {
        type: "function",
        function: {
          name: "list_files",
          description:
            "List files in this conversation's workspace (recursive), including attached projects listed under projects/<name>/. Call without arguments to list everything.",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: 'Optional subdirectory to list; omit for the whole workspace.'
              }
            }
          }
        }
      }
    );

    this.registerTool(
      'search_files',
      async (args) => {
        requireFileTools();
        if (typeof args?.pattern !== 'string' || !args.pattern.trim()) {
          throw new Error('search_files requires a "pattern"');
        }
        const root = await getChatRoot();
        const results = await workspaceSearch(args.pattern, "", root);
        let files = [...results.files];
        // Include attached projects so shared files are discoverable too.
        const summary = await getScopeSummary();
        for (const name of summary?.attached ?? []) {
          try {
            const l = await workspaceSearch(args.pattern, "", await getProjectRoot(name));
            files.push(
              ...l.files.map((f) => ({ ...f, path: `projects/${name}/${f.path}` })),
            );
          } catch {}
        }
        return {
          pattern: args.pattern,
          matches: files.length,
          files: files.slice(0, 50),
        };
      },
      {
        type: "function",
        function: {
          name: "search_files",
          description:
            "Find files in the workspace by name. Supports glob patterns (*.csv, report*) and falls back to case-insensitive substring matching.",
          parameters: {
            type: "object",
            properties: {
              pattern: { type: "string", description: 'Glob pattern or substring, e.g. "*.json" or "budget".' }
            },
            required: ["pattern"]
          }
        }
      }
    );

    // Project library helpers used by the Files panel (not exposed as AI tools)
    this.getProjectRoot = getProjectRoot;
    this.listProjectNames = listProjectNames;
  }
}

// Create a singleton instance
const toolManager = new ToolManager();

export { toolManager, ToolManager };
