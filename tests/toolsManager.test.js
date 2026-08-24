/**
 * Tests for app/composables/toolsManager.js
 *
 * The ToolManager class registers executors and schemas for AI tool calls.
 * We test:
 *   - Pure registration / lookup behavior with custom tools
 *   - The executeTool happy path
 *   - The default `search` tool, using vi.mock to stub `useSettings` and
 *     `globalThis.fetch` (introduces the mocking pattern in this codebase)
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";

// Mock useSettings BEFORE the toolsManager module loads so that the
// singleton's `registerDefaultTools` -> `getApiKey` path has a stubbed
// settings object to read from. The settings object is shared and mutable
// so tests can stage state (e.g. project_attachments) on it.
const mockSettings = { settings: { custom_api_key: "test-key-123" } };
vi.mock("../app/composables/useSettings", () => ({
  useSettings: () => mockSettings,
}));

// The guarded server-route calls attach a session token; stub it so the
// mocked fetch only sees the actual tool requests.
vi.mock("../app/composables/useSession", () => ({
  getSessionToken: vi.fn(async () => "test-session-token"),
}));

import { ToolManager, toolManager } from "../app/composables/toolsManager.js";
import { setActiveConversation } from "../app/composables/workspaceSession.js";

describe("ToolManager (custom-registered tool, no defaults)", () => {
  // Build a fresh manager without the default tools so each test is isolated
  // and we can exercise the basic registration API cleanly.
  function freshManager() {
    const tm = new ToolManager();
    for (const name of [
      "search",
      "getPageContents",
      "run_javascript",
      "write_file",
      "append_file",
      "read_file",
      "edit_file",
      "delete_file",
      "move_file",
      "rename_file",
      "list_files",
      "search_files",
    ]) {
      tm.unregisterTool(name);
    }
    return tm;
  }

  it("registers a tool and looks it up by name", () => {
    const tm = freshManager();
    const executor = vi.fn();
    const schema = { type: "function", function: { name: "ping" } };

    tm.registerTool("ping", executor, schema);

    const tool = tm.getTool("ping");
    expect(tool).toBeDefined();
    expect(tool.executor).toBe(executor);
    expect(tool.schema).toBe(schema);
  });

  it("unregisters a tool", () => {
    const tm = freshManager();
    tm.registerTool("ping", vi.fn(), { type: "function" });
    tm.unregisterTool("ping");
    expect(tm.getTool("ping")).toBeUndefined();
  });

  it("getToolNames lists all registered tools", () => {
    const tm = freshManager();
    tm.registerTool("a", vi.fn(), {});
    tm.registerTool("b", vi.fn(), {});
    expect(tm.getToolNames().sort()).toEqual(["a", "b"]);
  });

  it("getToolSchemas returns an array of schemas", () => {
    const tm = freshManager();
    tm.registerTool("a", vi.fn(), { type: "function", function: { name: "a" } });
    tm.registerTool("b", vi.fn(), { type: "function", function: { name: "b" } });
    const schemas = tm.getToolSchemas();
    expect(schemas).toHaveLength(2);
    expect(schemas.map((s) => s.function.name).sort()).toEqual(["a", "b"]);
  });

  it("getSchemasByNames returns only the requested ones (and ignores unknowns)", () => {
    const tm = freshManager();
    tm.registerTool("a", vi.fn(), { type: "function", function: { name: "a" } });
    tm.registerTool("b", vi.fn(), { type: "function", function: { name: "b" } });

    const schemas = tm.getSchemasByNames(["a", "ghost"]);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].function.name).toBe("a");
  });

  it("getSchemasByNames returns [] for an empty list", () => {
    const tm = freshManager();
    tm.registerTool("a", vi.fn(), { type: "function" });
    expect(tm.getSchemasByNames([])).toEqual([]);
  });
});

describe("ToolManager.executeTool", () => {
  function freshManager() {
    const tm = new ToolManager();
    tm.unregisterTool("search");
    tm.unregisterTool("getPageContents");
    return tm;
  }

  it("invokes the registered executor with the given args", async () => {
    const tm = freshManager();
    const executor = vi.fn(async (args) => `echo:${args.x}`);
    tm.registerTool("echo", executor, {});

    const result = await tm.executeTool("echo", { x: 42 });
    expect(executor).toHaveBeenCalledWith({ x: 42 });
    expect(result).toBe("echo:42");
  });

  it("throws when the tool is not registered", async () => {
    const tm = freshManager();
    await expect(tm.executeTool("ghost", {})).rejects.toThrow(/not found/);
  });
});

describe("default `search` tool (with mocked fetch)", () => {
  // Mocked at the test-file level so all tests in this block share it.
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("calls /api/search with the right query string and auth header", async () => {
    // The mocked fetch stands in for /api/search (the server route), so the
    // response shape here mirrors what search.get.js returns: `date`, not
    // `publishedDate`; arrays guaranteed; etc.
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          title: "x",
          url: "u",
          highlights: ["a key excerpt"],
          author: "Alice",
          date: "2024-01-15",
          subpages: []
        }]
      }),
    });

    const result = await toolManager.executeTool("search", { q: "hello", numResults: 3 });

    // Verify the request
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/api/search?");
    expect(url).toContain("q=hello");
    expect(url).toContain("numResults=3");
    expect(init.headers["X-API-Key"]).toBe("test-key-123");

    // Verify the result is reformatted with the new field set
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("x");
    expect(result.results[0].url).toBe("u");
    expect(result.results[0].highlights).toEqual(["a key excerpt"]);
    expect(result.results[0].author).toBe("Alice");
    expect(result.results[0].date).toBe("2024-01-15");
    expect(result.results[0].subpages).toEqual([]);
    expect(result.query).toBe("hello");
  });

  it("returns an empty list with a message when the API finds nothing", async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    const result = await toolManager.executeTool("search", { q: "nothing" });
    expect(result.results).toEqual([]);
    expect(result.message).toMatch(/no results/i);
  });

  it("throws when called without a query", async () => {
    await expect(toolManager.executeTool("search", {})).rejects.toThrow(/query/);
  });
});

describe("ToolManager (code sandbox + workspace tools)", () => {
  const SANDBOX_TOOL_NAMES = [
    "run_javascript",
    "write_file",
    "append_file",
    "read_file",
    "edit_file",
    "delete_file",
    "move_file",
    "rename_file",
    "list_files",
    "search_files",
  ];

  // Workspace tools require an active conversation scope.
  beforeAll(() => setActiveConversation("test-conversation"));

  it("registers all four sandbox/workspace tools with schemas", () => {
    for (const name of SANDBOX_TOOL_NAMES) {
      const tool = toolManager.getTool(name);
      expect(tool, `${name} should be registered`).toBeDefined();
      expect(tool.schema.function.name).toBe(name);
      expect(tool.schema.type).toBe("function");
      expect(typeof tool.executor).toBe("function");
    }
  });

  it("run_javascript rejects empty or missing code before starting a worker", async () => {
    await expect(toolManager.executeTool("run_javascript", {})).rejects.toThrow(
      /non-empty "code"/,
    );
    await expect(
      toolManager.executeTool("run_javascript", { code: "   " }),
    ).rejects.toThrow(/non-empty "code"/);
  });

  it("write_file validates its arguments", async () => {
    await expect(toolManager.executeTool("write_file", {})).rejects.toThrow(/path/);
    await expect(
      toolManager.executeTool("write_file", { path: "a.txt" }),
    ).rejects.toThrow(/content/);
    await expect(
      toolManager.executeTool("write_file", { path: "../evil", content: "x" }),
    ).rejects.toThrow(/traversal/i);
  });

  it("read_file and write_file round-trip through the workspace", async () => {
    const written = await toolManager.executeTool("write_file", {
      path: "tm-test/note.txt",
      content: "sandbox works",
    });
    expect(written.path).toBe("tm-test/note.txt");

    const readBack = await toolManager.executeTool("read_file", {
      path: "tm-test/note.txt",
    });
    expect(readBack.content).toBe("sandbox works");
  });

  it("append_file creates then extends files (chunked large-file pattern)", async () => {
    await toolManager.executeTool("append_file", {
      path: "tm-test/big.md",
      content: "# Part one\n",
    });
    await toolManager.executeTool("append_file", {
      path: "tm-test/big.md",
      content: "## Part two\nmore text\n",
    });
    const read = await toolManager.executeTool("read_file", { path: "tm-test/big.md" });
    expect(read.content).toBe("# Part one\n## Part two\nmore text\n");
  });

  it("edit_file reports byte counts without Node globals", async () => {
    await toolManager.executeTool("write_file", {
      path: "tm-test/edit.txt",
      content: "hello world",
    });
    const result = await toolManager.executeTool("edit_file", {
      path: "tm-test/edit.txt",
      old_text: "world",
      new_text: "there",
    });
    // Regression: Buffer is not defined in the browser — must not throw,
    // and must report a real byte count.
    expect(result.edited).toBe(true);
    expect(result.bytesReplaced).toBe(5);
    const read = await toolManager.executeTool("read_file", { path: "tm-test/edit.txt" });
    expect(read.content).toBe("hello there");
  });

  it("list_files returns files with a maxEntries marker", async () => {
    const listing = await toolManager.executeTool("list_files", {});
    expect(Array.isArray(listing.files)).toBe(true);
    expect(listing.files.some((f) => f.path === "tm-test/note.txt")).toBe(true);
    expect(listing.maxEntries).toBeGreaterThan(0);
  });
});

describe("list_files / search_files discover attached projects", () => {
  // Regression: these tools once only scanned the chat's private root, so
  // attached-project files were invisible to the model unless it guessed
  // the projects/<name>/ prefix.
  beforeAll(async () => {
    setActiveConversation("proj-merge-convo");
    mockSettings.settings.project_attachments = {
      "proj-merge-convo": ["radar"],
    };
    // Seed one file inside the attached project and one in the chat root.
    await toolManager.executeTool("write_file", {
      path: "projects/radar/data/watchlist.json",
      content: '{"repos":["nuxt/nuxt"]}',
    });
    await toolManager.executeTool("write_file", {
      path: "chat-note.txt",
      content: "chat scoped",
    });
  });

  afterAll(() => {
    setActiveConversation("test-conversation");
    mockSettings.settings.project_attachments = {};
  });

  it("list_files merges attached projects under their projects/<name>/ prefix", async () => {
    const listing = await toolManager.executeTool("list_files", {});

    const paths = listing.files.map((f) => f.path);
    expect(paths).toContain("chat-note.txt");
    expect(paths).toContain("projects/radar/data/watchlist.json");
    expect(listing.truncated).toBe(false);
  });

  it("list_files with an explicit project subdirectory returns scoped (unprefixed) paths", async () => {
    // Bare project folders are refused (resolveScopePath serves file ops
    // too), but listing a real subdirectory inside the project is fine.
    const listing = await toolManager.executeTool("list_files", {
      path: "projects/radar/data",
    });

    expect(listing.files.some((f) => f.path === "watchlist.json")).toBe(true);
    // No double prefixing inside a scoped listing.
    expect(listing.files.some((f) => f.path.startsWith("projects/"))).toBe(false);
  });

  it("search_files finds project files and returns prefixed paths", async () => {
    const result = await toolManager.executeTool("search_files", {
      pattern: "watchlist",
    });

    expect(result.matches).toBeGreaterThanOrEqual(1);
    expect(result.files.some((f) => f.path === "projects/radar/data/watchlist.json")).toBe(true);
  });

  it("search_files reports zero matches cleanly", async () => {
    const result = await toolManager.executeTool("search_files", {
      pattern: "no-such-file-xyz",
    });

    expect(result.matches).toBe(0);
    expect(result.files).toEqual([]);
  });

  it("list_files still refuses unattached projects", async () => {
    await expect(
      toolManager.executeTool("list_files", { path: "projects/not-attached/x.txt" }),
    ).rejects.toThrow(/not attached/);
  });
});

