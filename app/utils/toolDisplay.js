/**
 * @file toolDisplay.js
 * @description Presentation metadata for AI tools: human titles, icons,
 * and one-line context for the collapsible tool widgets in chat.
 *
 * Pure data + helpers so it stays unit-testable and shareable between
 * desktop and mobile renderers.
 */

/**
 * Per-tool presentation config. `kind` selects the detail renderer in the
 * widget component; `title` replaces raw function names in the UI.
 */
export const TOOL_DISPLAY = {
  run_javascript: {
    title: "Run Code",
    icon: "material-symbols:code-rounded",
    kind: "code",
  },
  write_file: {
    title: "Write File",
    icon: "material-symbols:edit-document-outline-rounded",
    kind: "file-write",
  },
  read_file: {
    title: "Read File",
    icon: "material-symbols:description-outline-rounded",
    kind: "file-read",
  },
  edit_file: {
    title: "Edit File",
    icon: "material-symbols:edit-note-rounded",
    kind: "file-edit",
  },
  delete_file: {
    title: "Delete File",
    icon: "material-symbols:delete-outline-rounded",
    kind: "file-delete",
  },
  move_file: {
    title: "Move File",
    icon: "material-symbols:drive-file-move-outline-rounded",
    kind: "file-move",
  },
  rename_file: {
    title: "Rename File",
    icon: "material-symbols:drive-file-rename-outline-rounded",
    kind: "file-move",
  },
  search_files: {
    title: "Search Files",
    icon: "material-symbols:manage-search-rounded",
    kind: "file-search",
  },
  list_files: {
    title: "List Files",
    icon: "material-symbols:folder-open-outline-rounded",
    kind: "file-list",
  },
  search: {
    title: "Web Search",
    icon: "material-symbols:search-rounded",
    kind: "search",
  },
  getPageContents: {
    title: "Read Web Pages",
    icon: "material-symbols:web-asset",
    kind: "webcrawl",
  },
};

const MEMORY_TOOLS = ["addMemory", "modifyMemory", "deleteMemory"];

/** Fallback icons per broad category. */
const FALLBACK_ICON = "material-symbols:build-circle-outline-rounded";
const MEMORY_ICON = "material-symbols:psychology-rounded";

/**
 * "run_javascript" -> "Run javascript"; camelCase gets spaced too.
 * @param {string} name
 */
export function prettifyToolName(name) {
  if (!name || typeof name !== "string") return "Tool";
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Display config for a tool function name.
 * @param {string} name
 * @returns {{title: string, icon: string, kind: string}}
 */
export function getToolDisplay(name) {
  const known = TOOL_DISPLAY[name];
  if (known) return known;
  if (MEMORY_TOOLS.includes(name)) {
    return { title: prettifyToolName(name), icon: MEMORY_ICON, kind: "memory" };
  }
  return { title: prettifyToolName(name), icon: FALLBACK_ICON, kind: "generic" };
}

/**
 * Safely parses a tool-call arguments JSON string.
 * @param {*} json
 * @returns {object}
 */
export function parseToolJson(json) {
  if (!json || typeof json !== "string") return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function unescapeJsonFragment(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, esc) => {
    switch (esc[0]) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case '"': return '"';
      case "\\": return "\\";
      case "/": return "/";
      case "u": return String.fromCharCode(parseInt(esc.slice(1), 16));
      default: return esc;
    }
  });
}

/**
 * Parses tool-call arguments that may still be STREAMING. Full JSON parses
 * normally; truncated JSON is salvaged field-by-field (every string field
 * that has begun is returned with whatever has streamed so far), so widgets
 * can show live progress ("Writing…" with the content appearing).
 *
 * @param {*} json Raw arguments string (possibly incomplete).
 * @returns {{ args: object, complete: boolean }}
 */
export function parsePartialToolArgs(json) {
  if (!json || typeof json !== "string") return { args: {}, complete: true };
  try {
    const parsed = JSON.parse(json);
    return {
      args:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {},
      complete: true,
    };
  } catch {}

  const args = {};
  const stringRe = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"((?:\\.|[^"\\])*)/g;
  let m;
  while ((m = stringRe.exec(json)) !== null) {
    args[m[1]] = unescapeJsonFragment(m[2]);
  }
  const numRe = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*(-?\d+(?:\.\d+)?)/g;
  while ((m = numRe.exec(json)) !== null) {
    if (!(m[1] in args)) args[m[1]] = Number(m[2]);
  }
  const boolRe = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*(true|false)/g;
  while ((m = boolRe.exec(json)) !== null) {
    if (!(m[1] in args)) args[m[1]] = m[2] === "true";
  }
  return { args, complete: false };
}

/** Collapse whitespace and cap length for header snippets. */
function snippet(text, max = 42) {
  if (typeof text !== "string") return "";
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).trimEnd() + "…";
}

/**
 * One-line contextual detail for the widget header row.
 *
 * @param {string} name     Tool function name.
 * @param {*}      argsJson Raw arguments JSON string.
 * @returns {string}
 */
export function toolHeaderDetail(name, argsJson) {
  const args = parseToolJson(argsJson);
  switch (getToolDisplay(name).kind) {
    case "code": {
      const code = typeof args.code === "string" ? args.code : "";
      const lines = code.split("\n").map((l) => l.trim()).filter(Boolean);
      // Prefer the first meaningful statement over comments.
      const first = lines.find((l) => !l.startsWith("//")) || "";
      return snippet(first);
    }
    case "file-write":
    case "file-read":
    case "file-edit":
    case "file-delete":
    case "file-move":
      return typeof args.path === "string" ? snippet(args.path, 48) : "";
    case "file-search":
      return typeof args.pattern === "string" ? snippet(args.pattern, 32) : "";
    default:
      return "";
  }
}

/**
 * Parses a run_javascript tool RESULT payload into renderable state.
 *
 * @param {*} resultJson  The stored tool.result string (JSON) or null.
 * @returns {{state: 'running'|'ok'|'error'|'timeout', valueText: string|null, logs: string[], error: string|null, hasResult: boolean}}
 */
export function parseRunResult(resultJson) {
  if (!resultJson) return { state: "running", valueText: null, logs: [], error: null, hasResult: false };
  const data = parseToolJson(typeof resultJson === "string" ? resultJson : null) ||
    (typeof resultJson === "object" ? resultJson : {});
  if (!data.ok && data.error === undefined && data.result === undefined) {
    return { state: "running", valueText: null, logs: [], error: null, hasResult: false };
  }
  if (data.timedOut) {
    return { state: "timeout", valueText: null, logs: Array.isArray(data.logs) ? data.logs : [], error: data.error || null, hasResult: false };
  }
  if (data.ok) {
    return {
      state: "ok",
      valueText: data.hasResult ? String(data.result ?? "") : null,
      logs: Array.isArray(data.logs) ? data.logs : [],
      error: null,
      hasResult: !!data.hasResult,
    };
  }
  return {
    state: "error",
    valueText: null,
    logs: Array.isArray(data.logs) ? data.logs : [],
    error: data.error || "Execution failed",
    hasResult: false,
  };
}

/**
 * Formats byte counts for file listings.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
