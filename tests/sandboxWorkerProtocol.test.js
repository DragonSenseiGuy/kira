/**
 * Protocol tests for the sandbox WORKER SOURCE.
 *
 * Runs the exact generated worker script inside a node:vm context with a
 * minimal DedicatedWorkerGlobalScope shim (self/postMessage/onmessage), so
 * the shipped code path is exercised headlessly:
 *   - run/return values, console capture, async/await
 *   - network + storage hardening
 *   - workspace RPC round-trip
 *   - token hygiene (closure vars invisible to user code)
 */

import { describe, it, expect } from "vitest";
import vm from "node:vm";
import {
  buildSandboxWorkerSource,
  SANDBOX_RESULT_CAP,
} from "../app/utils/sandbox.js";

/**
 * Boots the worker source in a vm sandbox and returns handles to drive it.
 * The context object doubles as `self` (like a real worker global), so
 * `self.x = …` assignments become visible as bare globals to sandboxed code.
 *
 * `strictGlobals` mimics real DedicatedWorkerGlobalScope semantics where
 * properties like indexedDB/caches are GETTER-ONLY accessors: assignment
 * throws TypeError (in strict mode) instead of silently succeeding — the
 * exact browser behavior that broke the sandbox at launch.
 */
function bootWorker({ strictGlobals = false } = {}) {
  const sent = []; // everything the worker postMessages
  const consoleLines = [];
  const fakeConsole = {};
  for (const lvl of ["log", "info", "warn", "error", "debug", "trace"]) {
    fakeConsole[lvl] = (...args) => consoleLines.push([lvl, ...args]);
  }

  // self === global, exactly like a DedicatedWorkerGlobalScope.
  const ctx = {
    postMessage: (msg) => sent.push(msg),
  };
  ctx.self = ctx;
  ctx.navigator = {};
  ctx.console = fakeConsole;

  if (strictGlobals) {
    for (const name of ["indexedDB", "caches", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker"]) {
      Object.defineProperty(ctx, name, {
        get() {
          return undefined;
        },
        configurable: true, // real browsers expose these as configurable accessors
      });
    }
  }

  const context = vm.createContext(ctx);
  // Standard globals exist inside vm contexts already (Object, Map, Promise…).

  vm.runInContext(buildSandboxWorkerSource(), context, {
    filename: "sandbox.worker.js",
  });

  expect(typeof ctx.onmessage).toBe("function");

  const state = { cursor: 0 };

  return {
    sent,
    consoleLines,
    /** Deliver a message INTO the worker. */
    receive(msg) {
      ctx.onmessage({ data: msg });
    },
    /** Send a run request and resolve when its done payload arrives. */
    async run(code, token = "tok-test") {
      ctx.onmessage({ data: { type: "run", token, code } });
      return await waitForDone(sent, state);
    },
    /** Answer the newest pending fs request like the main thread would. */
    replyFs(result) {
      const fsMsg = [...sent].reverse().find((m) => m.type === "fs");
      expect(fsMsg, "expected a pending fs request").toBeTruthy();
      ctx.onmessage({
        data: { type: "fs_result", token: fsMsg.token, id: fsMsg.id, ok: true, value: result },
      });
      return fsMsg;
    },
    ctxReply,
    ctxReplyError,
  };

  function ctxReply(value) {
    const msg = [...sent].reverse().find((m) => m.type === "fs");
    expect(msg, "expected a pending RPC").toBeTruthy();
    ctx.onmessage({
      data: { type: "fs_result", token: msg.token, id: msg.id, ok: true, value },
    });
  }

  function ctxReplyError(error) {
    const msg = [...sent].reverse().find((m) => m.type === "fs");
    expect(msg, "expected a pending RPC").toBeTruthy();
    ctx.onmessage({
      data: { type: "fs_result", token: msg.token, id: msg.id, ok: false, error },
    });
  }
}

async function waitForDone(sent, state) {
  for (let i = 0; i < 200; i++) {
    for (let j = state.cursor; j < sent.length; j++) {
      if (sent[j].type === "done") {
        state.cursor = j + 1;
        return sent[j];
      }
    }
    await new Promise((r) => setImmediate(r));
  }
  throw new Error("Worker never posted a done message");
}

describe("sandbox worker protocol", () => {
  it("executes simple code and returns the serialized result", async () => {
    const w = bootWorker();
    const done = await w.run("return 1 + 1");
    expect(done.token).toBe("tok-test");
    expect(done.payload.ok).toBe(true);
    expect(done.payload.hasResult).toBe(true);
    expect(done.payload.result).toBe("2");
  });

  it("supports top-level await and console capture", async () => {
    const w = bootWorker();
    const done = await w.run(`
      console.log("hello", { a: 1 });
      await Promise.resolve();
      return "after await";
    `);
    expect(done.payload.ok).toBe(true);
    expect(done.payload.result).toBe("after await");
    expect(done.payload.logs.join("\n")).toContain('hello { a: 1 }');
  });

  it("reports thrown errors without crashing", async () => {
    const w = bootWorker();
    const done = await w.run('throw new TypeError("boom")');
    expect(done.payload.ok).toBe(false);
    expect(done.payload.error).toContain("TypeError: boom");
  });

  it("reports syntax errors as failed runs", async () => {
    const w = bootWorker();
    const done = await w.run("return {{{");
    expect(done.payload.ok).toBe(false);
    expect(String(done.payload.error)).toMatch(/SyntaxError/i);
  });

  it("blocks network access surfaces", async () => {
    const w = bootWorker();
    const done = await w.run(`
      try { await fetch("https://evil.example"); return "fetched"; }
      catch (e) { return "blocked: " + e.message; }
    `);
    expect(done.payload.result).toContain("blocked");
    expect(done.payload.logs.length).toBe(0);
  });

  it("survives getter-only worker globals (real browser semantics) and still blocks them", async () => {
    // Regression: on real WorkerGlobalScope, `self.indexedDB = undefined`
    // throws "Cannot set property indexedDB of #<WorkerGlobalScope> which
    // has only a getter", killing the whole worker at startup.
    const w = bootWorker({ strictGlobals: true });

    const done = await w.run(`
      return JSON.stringify({
        alive: true,
        idb: typeof indexedDB,
        caches: typeof caches,
        ws: typeof WebSocket,
      });
    `);
    expect(done.payload.ok).toBe(true);
    const types = JSON.parse(done.payload.result);
    expect(types.alive).toBe(true);
    // Parameter shadowing keeps them neutralized even though the globals
    // themselves resisted redefinition.
    expect(types.idb).toBe("undefined");
    expect(types.caches).toBe("undefined");
    expect(types.ws).toBe("undefined");
  });

  it("strips storage escape hatches (indexedDB/caches/navigator.storage)", async () => {
    const w = bootWorker();
    const done = await w.run(`
      return JSON.stringify({
        idb: typeof indexedDB,
        caches: typeof caches,
        storage: typeof navigator.storage,
        ws: typeof WebSocket,
        xhr: typeof XMLHttpRequest,
        wk: typeof Worker,
      });
    `);
    const types = JSON.parse(done.payload.result);
    expect(types.idb).toBe("undefined");
    expect(types.caches).toBe("undefined");
    expect(types.storage).toBe("undefined");
    expect(types.ws).toBe("undefined");
    expect(types.xhr).toBe("undefined");
    expect(types.wk).toBe("undefined");

    // fetch & importScripts are replaced by blocking functions.
    const blocked = await w.run(`
      try { fetch(); return "allowed"; } catch (e) { return "fetch-blocked"; }
    `);
    expect(blocked.payload.result).toBe("fetch-blocked");
  });

  it("keeps closure internals invisible to sandboxed code", async () => {
    const w = bootWorker();
    const done = await w.run(`
      var leaked = [];
      try { leaked.push(typeof __runToken); } catch (e) { leaked.push("throw"); }
      try { leaked.push(typeof __pending); } catch (e) { leaked.push("throw"); }
      try { leaked.push(typeof logs); } catch (e) { leaked.push("throw"); }
      try { leaked.push(typeof pushLog); } catch (e) { leaked.push("throw"); }
      return leaked.join(",");
    `);
    // None of the worker's internal bindings may be reachable from user
    // code (typeof never throws for undeclared names, so "undefined" is
    // the pass condition — a leaked binding would report its real type).
    expect(done.payload.result).toBe("undefined,undefined,undefined,undefined");
  });

  it("round-trips workspace RPC calls", async () => {
    const w = bootWorker();
    const promise = w.run(`return await workspace.read("notes/a.txt")`);
    // Let the run message be processed so the fs request lands.
    await new Promise((r) => setImmediate(r));
    const fsMsg = w.replyFs({ path: "notes/a.txt", content: "file body" });
    expect(fsMsg.op).toBe("read");
    expect(fsMsg.args).toEqual(["notes/a.txt"]);
    const done = await promise;
    expect(done.payload.ok).toBe(true);
    expect(JSON.stringify(done.payload)).toContain("file body");
  });

  it("exposes workspace.append through the bridge", async () => {
    const w = bootWorker();
    const promise = w.run(`return await workspace.append("log.txt", "line\\n")`);
    await new Promise((r) => setImmediate(r));
    const fsMsg = [...w.sent].reverse().find((m) => m.type === "fs");
    expect(fsMsg.op).toBe("append");
    expect(fsMsg.args).toEqual(["log.txt", "line\n"]);
    w.ctxReply({ path: "log.txt", bytes: 5 });
    const done = await promise;
    expect(done.payload.ok).toBe(true);
    expect(JSON.stringify(done.payload)).toContain("log.txt");
  });

  it("routes net.fetch through the permissioned bridge", async () => {    const w = bootWorker();
    const promise = w.run(`
      var r = await net.fetch("https://api.example.com/data", { method: "GET" });
      return r.status + ":" + String(r.body).slice(0, 5);
    `);
    await new Promise((r) => setImmediate(r));
    // The main-thread handler is injected as the "net" op on the same channel.
    const netMsg = [...w.sent].reverse().find((m) => m.type === "fs" && m.op === "net");
    expect(netMsg, "expected a pending net request").toBeTruthy();
    expect(netMsg.args[0]).toBe("https://api.example.com/data");
    expect(JSON.parse(netMsg.args[1])).toEqual({ method: "GET" });
    w.ctxReply({ status: 200, contentType: "text/plain", body: "hello world", bytes: 11 });
    const done = await promise;
    expect(done.payload.result).toBe("200:hello");
  });

  it("propagates denied network requests as errors", async () => {
    const w = bootWorker();
    const promise = w.run(`
      try { await net.fetch("https://denied.example.com"); return "sent"; }
      catch (e) { return "refused: " + e.message; }
    `);
    await new Promise((r) => setImmediate(r));
    const netMsg = [...w.sent].reverse().find((m) => m.type === "fs" && m.op === "net");
    w.ctxReplyError("Sandbox networking is turned off in Settings → Autonomy.");
    const done = await promise;
    expect(done.payload.result).toContain("refused");
  });

  it("surfaces workspace errors as rejected calls", async () => {
    const w = bootWorker();
    const promise = w.run(`
      try { await workspace.write("../evil", "x"); return "wrote"; }
      catch (e) { return "refused: " + e.message; }
    `);
    await new Promise((r) => setImmediate(r));
    const fsMsg = [...w.sent].reverse().find((m) => m.type === "fs");
    expect(fsMsg.args[0]).toBe("../evil"); // main thread sanitizer sees raw path
    w.receive({
      type: "fs_result",
      token: fsMsg.token,
      id: fsMsg.id,
      ok: false,
      error: "Path traversal ('..') is not allowed in the workspace.",
    });
    const done = await promise;
    expect(done.payload.result).toContain("refused");
  });

  it("ignores malformed inbound messages", async () => {
    const w = bootWorker();
    expect(() => w.receive({ data: null })).not.toThrow();
    expect(() => w.receive({})).not.toThrow();
    expect(() => w.receive({ data: { type: "run" } })).not.toThrow(); // no code
    const done = await w.run("return 'still alive'");
    expect(done.payload.result).toBe("still alive");
  });

  it("caps huge returned strings at RESULT_CAP with truncation marker", async () => {
    const w = bootWorker();
    const done = await w.run(`return "z".repeat(${SANDBOX_RESULT_CAP * 4});`);
    expect(done.payload.ok).toBe(true);
    expect(done.payload.result.length).toBeLessThan(SANDBOX_RESULT_CAP + 100);
    expect(done.payload.result).toContain("[truncated");
  }, 30000);
});
