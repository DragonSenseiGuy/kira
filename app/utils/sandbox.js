/**
 * @file sandbox.js
 * @description The JavaScript execution sandbox. Model-supplied code runs in
 * a throwaway Web Worker built from a Blob URL, with:
 *
 * - Network hardening: fetch / XHR / WebSocket / EventSource / importScripts
 *   / Worker / sendBeacon are blocked; indexedDB and caches (which share the
 *   app origin's storage!) and navigator.storage (OPFS) are removed.
 * - Console capture with a total byte budget.
 * - Top-level await/return via AsyncFunction.
 * - A workspace file bridge: sandboxed code gets `workspace.read(path)`,
 *   `workspace.write(path, text)` and `workspace.list(path)` backed by the
 *   OPFS workspace on the main thread over a request/response protocol.
 * - Message authentication: every postMessage carries a per-run token held
 *   in worker closure scope, so sandboxed code cannot forge "done" or
 *   filesystem results.
 * - Hard timeout via worker.terminate().
 */

/** Default execution timeout for sandboxed code. */
export const SANDBOX_TIMEOUT_MS = 30_000;

/** Upper bound for user-requested timeouts. */
export const SANDBOX_MAX_TIMEOUT_MS = 120_000;

/** Total console-capture budget before logging becomes a no-op. */
export const SANDBOX_LOG_BUDGET = 64 * 1024;

/** Per-line console cap. */
export const SANDBOX_LINE_CAP = 8 * 1024;

/** Cap for the serialized return value. */
export const SANDBOX_RESULT_CAP = 32 * 1024;

/**
 * Clamps a requested timeout into the allowed range.
 * @param {*} requested
 * @returns {number}
 */
export function clampSandboxTimeout(requested) {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return SANDBOX_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(n), 1000), SANDBOX_MAX_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Shared helpers — these exact function sources get embedded into the worker
// so tests can exercise them directly while the worker uses the same logic.
// ---------------------------------------------------------------------------

export function capText(text, cap) {
  const s = typeof text === "string" ? text : String(text);
  if (s.length <= cap) return s;
  return s.slice(0, cap) + `\n[truncated, ${s.length - cap} chars omitted]`;
}

export function safeSerialize(value, cap) {
  const seen = new WeakSet();
  function ser(v, depth) {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return v;
    if (t === "number" || t === "boolean" || t === "undefined") return String(v);
    if (t === "bigint") return v.toString() + "n";
    if (t === "symbol") return v.toString();
    if (t === "function") return `[Function${v.name ? ": " + v.name : ""}]`;
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (depth > 6) return "[max depth]";
    if (seen.has(v)) return "[circular]";
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        return "[" + v.map((x) => ser(x, depth + 1)).join(", ") + "]";
      }
      if (t === "object") {
        if (v instanceof Date) return v.toISOString();
        if (typeof Map !== "undefined" && v instanceof Map) {
          return (
            "Map(" +
            v.size +
            ") { " +
            Array.from(v.entries())
              .slice(0, 100)
              .map(([k, x]) => `${ser(k, depth + 1)} => ${ser(x, depth + 1)}`)
              .join(", ") +
            " }"
          );
        }
        if (typeof Set !== "undefined" && v instanceof Set) {
          return (
            "Set(" +
            v.size +
            ") { " +
            Array.from(v.values())
              .slice(0, 100)
              .map((x) => ser(x, depth + 1))
              .join(", ") +
            " }"
          );
        }
        const parts = Object.keys(v).map(
          (k) => `${k}: ${ser(v[k], depth + 1)}`,
        );
        return "{ " + parts.join(", ") + " }";
      }
      return String(v);
    } finally {
      seen.delete(v);
    }
  }
  return capText(ser(value, 0), cap);
}

/**
 * Strips markdown code fences a model may have wrapped around executable
 * code (```js\n...\n```). Unterminated closing fences are tolerated.
 *
 * @param {*} code
 * @returns {string}
 */
export function stripCodeFences(code) {
  if (typeof code !== "string") return "";
  let s = code.trim();
  if (!s.startsWith("```")) return s;

  const body = s.replace(/^```[^\n]*\n/, "").replace(/\n?```\s*$/, "");
  return body.trim();
}

/**
 * Builds the complete worker source.
 *
 * IMPORTANT: this must stay a fully STATIC template. Do not interpolate
 * function objects here — bundled/minified `Function.prototype.toString()`
 * output is fragile across build pipelines. The helper logic below mirrors
 * the exported capText/safeSerialize; sandboxWorkerProtocol.test.js asserts
 * the shipped source behaves identically.
 *
 * The whole script is wrapped in an IIFE so internal bindings (token,
 * pending RPC map, log buffers) live in closure scope. This matters for
 * security: top-level `let`/`const` land in the global lexical
 * environment, which `new Function` bodies CAN reach — closure vars cannot.
 * @returns {string}
 */
export function buildSandboxWorkerSource() {
  return `
(function () {
"use strict";
var LOG_BUDGET = ${SANDBOX_LOG_BUDGET};
var LINE_CAP = ${SANDBOX_LINE_CAP};
var RESULT_CAP = ${SANDBOX_RESULT_CAP};

function capText(text, cap) {
  var s = typeof text === "string" ? text : String(text);
  if (s.length <= cap) return s;
  return s.slice(0, cap) + "\\n[truncated, " + (s.length - cap) + " chars omitted]";
}
function typeName(v) {
  if (v === null) return "null";
  var t = typeof v;
  if (t === "number" || t === "boolean" || t === "undefined") return t;
  return t;
}
function safeSerialize(value, cap) {
  var seen = [];
  function ser(v, depth) {
    if (v === null) return "null";
    var t = typeof v;
    if (t === "string") return v;
    if (t === "number" || t === "boolean" || t === "undefined") return String(v);
    if (t === "bigint") return v.toString() + "n";
    if (t === "symbol") return v.toString();
    if (t === "function") return "[Function" + (v.name ? ": " + v.name : "") + "]";
    if (v instanceof Error) return v.name + ": " + v.message;
    if (depth > 6) return "[max depth]";
    for (var i = 0; i < seen.length; i++) if (seen[i] === v) return "[circular]";
    seen.push(v);
    try {
      if (Array.isArray(v)) {
        var out = [];
        for (var j = 0; j < v.length; j++) out.push(ser(v[j], depth + 1));
        return "[" + out.join(", ") + "]";
      }
      if (t === "object") {
        if (v instanceof Date) return v.toISOString();
        if (typeof Map !== "undefined" && v instanceof Map) {
          var parts = [];
          var count = 0;
          v.forEach(function (val, key) {
            if (count++ < 100) parts.push(ser(key, depth + 1) + " => " + ser(val, depth + 1));
          });
          return "Map(" + v.size + ") { " + parts.join(", ") + " }";
        }
        if (typeof Set !== "undefined" && v instanceof Set) {
          var items = [];
          var c2 = 0;
          v.forEach(function (val) {
            if (c2++ < 100) items.push(ser(val, depth + 1));
          });
          return "Set(" + v.size + ") { " + items.join(", ") + " }";
        }
        var fields = [];
        var keys = Object.keys(v);
        for (var k = 0; k < keys.length; k++) {
          fields.push(keys[k] + ": " + ser(v[keys[k]], depth + 1));
        }
        return "{ " + fields.join(", ") + " }";
      }
      return String(v);
    } finally {
      seen.pop();
    }
  }
  return capText(ser(value, 0), cap);
}

var logBytes = 0;
var logs = [];
function pushLog(level, args) {
  if (logBytes >= LOG_BUDGET) return;
  var line = level + ": " + Array.prototype.map.call(args, function (a) {
    return safeSerialize(a, LINE_CAP);
  }).join(" ");
  if (logBytes + line.length > LOG_BUDGET) {
    line = capText(line, Math.max(0, LOG_BUDGET - logBytes));
  }
  logs.push(line);
  logBytes += line.length;
}
["log", "info", "warn", "error", "debug", "trace"].forEach(function (lvl) {
  try { console[lvl] = function () { pushLog(lvl, arguments); }; } catch (e) {}
});

// ---- network & storage hardening --------------------------------------
// Some globals on WorkerGlobalScope (indexedDB, caches, …) are GETTER-ONLY
// accessors: strict-mode assignment throws TypeError and would kill this
// script before any handler registers. Every mutation below is therefore
// best-effort AND user code additionally runs with these identifiers
// shadowed as function parameters (see the runner below), which works
// regardless of property semantics.
function __block() { throw new Error("Network access is disabled inside the JavaScript sandbox."); }
function __tryDefineGlobal(name, value) {
  try { self[name] = value; return; } catch (e) {}
  try {
    Object.defineProperty(self, name, { value: value, writable: true, configurable: true });
    return;
  } catch (e) {}
  try {
    delete self[name];
  } catch (e) {}
}
__tryDefineGlobal("fetch", __block);
__tryDefineGlobal("XMLHttpRequest", undefined);
__tryDefineGlobal("WebSocket", undefined);
__tryDefineGlobal("EventSource", undefined);
__tryDefineGlobal("importScripts", __block);
__tryDefineGlobal("Worker", undefined);
__tryDefineGlobal("indexedDB", undefined);
__tryDefineGlobal("caches", undefined);
try { Object.defineProperty(navigator, "storage", { value: undefined }); } catch (e) {}
try { navigator.sendBeacon = function () { return false; }; } catch (e) {}

// Identifiers shadowed as parameters of the compiled user function — these
// hold even when the corresponding global resists redefinition.
var __SHADOWED_NETWORK = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "indexedDB", "caches"];

// ---- workspace bridge (RPC to main thread OPFS) -----------------------
var __rpcId = 0;
var __pending = {};
var __runToken = null;
function __fsCall(op, args) {
  return new Promise(function (resolve, reject) {
    var id = ++__rpcId;
    __pending[id] = { resolve: resolve, reject: reject };
    self.postMessage({ type: "fs", token: __runToken, id: id, op: op, args: args });
  });
}
self.workspace = {
  read: function (path) { return __fsCall("read", [String(path)]); },
  write: function (path, content) { return __fsCall("write", [String(path), String(content)]); },
  append: function (path, content) { return __fsCall("append", [String(path), String(content)]); },
  list: function (path) { return __fsCall("list", [path === undefined ? "" : String(path)]); },
};

// ---- permissioned network bridge ---------------------------------------
// Raw fetch stays blocked; net.fetch routes through the main thread where
// domain consent, SSRF rules and size caps are enforced.
var __netFetch = function (url, opts) {
  return __fsCall("net", [
    String(url),
    JSON.stringify(opts && typeof opts === "object" ? opts : {}),
  ]);
};
self.net = { fetch: __netFetch };

self.onmessage = function (event) {
  var data = event.data || {};

  if (data.type === "fs_result") {
    var p = __pending[data.id];
    if (!p) return;
    delete __pending[data.id];
    if (data.ok) p.resolve(data.value);
    else p.reject(new Error(data.error || "Workspace operation failed."));
    return;
  }

  if (data.type !== "run" || typeof data.code !== "string") return;
  __runToken = data.token;

  (async function () {
    try {
      var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      // Shadow network/storage identifiers as PARAMETERS: parameters take
      // precedence over globals in the scope chain and cannot be defeated
      // by getter-only properties on the worker global.
      var paramValues = [];
      for (var si = 0; si < __SHADOWED_NETWORK.length; si++) {
        paramValues.push(
          __SHADOWED_NETWORK[si] === "fetch" || __SHADOWED_NETWORK[si] === "importScripts"
            ? __block
            : undefined
        );
      }
      var fn = AsyncFunction.apply(
        null,
        __SHADOWED_NETWORK.concat(['"use strict";\\n' + data.code])
      );
      // Bind the shadowing values at call time — parameters take
      // precedence over globals in the function's scope chain.
      var result = await fn.apply(null, paramValues);
      self.postMessage({
        type: "done",
        token: __runToken,
        payload: {
          ok: true,
          result: result === undefined ? null : safeSerialize(result, RESULT_CAP),
          hasResult: result !== undefined,
          logs: logs,
        },
      });
    } catch (err) {
      self.postMessage({
        type: "done",
        token: __runToken,
        payload: {
          ok: false,
          error: err instanceof Error ? err.name + ": " + err.message : String(err),
          logs: logs,
        },
      });
    }
  })();
};
})();
`.trim();
}

// ---------------------------------------------------------------------------
// Main-thread runner
// ---------------------------------------------------------------------------

let cachedWorkerUrl = null;

function getWorkerUrl() {
  if (!cachedWorkerUrl) {
    const blob = new Blob([buildSandboxWorkerSource()], {
      type: "text/javascript",
    });
    cachedWorkerUrl = URL.createObjectURL(blob);
  }
  return cachedWorkerUrl;
}

function makeRunToken() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Dispatches one workspace RPC from the sandbox to injected handlers.
 * @param {{read?:Function, write?:Function, list?:Function}} fs - Workspace ops.
 * @param {string} op
 * @param {Array} args
 */
async function handleFsCall(fs, op, args) {
  if (!fs || typeof fs[op] !== "function") {
    throw new Error(`Workspace "${op}" is not available.`);
  }
  return await fs[op](...args);
}

/**
 * Runs model-supplied JavaScript inside a fresh sandboxed worker.
 *
 * @param {Object} options
 * @param {string} options.code - Code to execute (top-level await/return OK).
 * @param {number} [options.timeoutMs]
 * @param {{read?:Function, write?:Function, list?:Function}} [options.fs]
 *   Workspace operations exposed to the sandbox as `workspace.*`.
 * @returns {Promise<{ok: boolean, result?: string|null, hasResult?: boolean,
 *   error?: string, logs?: string[], timedOut?: boolean}>}
 */
export async function runInSandboxWorker({ code, timeoutMs, fs }) {
  const effectiveTimeout = clampSandboxTimeout(timeoutMs);
  const token = makeRunToken();
  const cleanCode = stripCodeFences(code);

  return await new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;
    let worker = null;

    const settle = (payload) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (worker) {
        try {
          worker.terminate();
        } catch {}
      }
      resolve(payload);
    };

    try {
      worker = new Worker(getWorkerUrl());
    } catch (err) {
      settle({
        ok: false,
        error: `Could not start the JavaScript sandbox: ${err.message || err}`,
        logs: [],
      });
      return;
    }

    timeoutId = setTimeout(() => {
      settle({
        ok: false,
        error: `Execution timed out after ${Math.round(effectiveTimeout / 1000)}s (infinite loop or very long task).`,
        timedOut: true,
        logs: [],
      });
    }, effectiveTimeout);

    worker.onerror = (e) => {
      settle({
        ok: false,
        error: (e && e.message) || "The sandbox worker crashed.",
        logs: [],
      });
    };

    worker.onmessage = (e) => {
      const data = e.data || {};
      // Drop anything that is not part of THIS run's authenticated protocol.
      if (!data || data.token !== token) return;

      if (data.type === "fs") {
        handleFsCall(fs, data.op, data.args || []).then(
          (value) =>
            worker.postMessage({
              type: "fs_result",
              token,
              id: data.id,
              ok: true,
              value,
            }),
          (error) =>
            worker.postMessage({
              type: "fs_result",
              token,
              id: data.id,
              ok: false,
              error: error.message || String(error),
            }),
        );
        return;
      }

      if (data.type === "done") {
        settle({ ...data.payload, timedOut: false });
      }
    };

    worker.postMessage({ type: "run", token, code: cleanCode });
  });
}
