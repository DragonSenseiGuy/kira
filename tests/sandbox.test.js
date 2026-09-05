/**
 * Tests for app/utils/sandbox.js — the JavaScript execution sandbox.
 *
 * The worker itself can't run under happy-dom (no real Worker), so we test:
 *   - The pure helpers that get embedded into the worker source
 *   - The timeout clamp
 *   - Smoke assertions on the generated worker source: hardening lines
 *     must be present (network, storage, token protocol, AsyncFunction)
 */

import { describe, it, expect } from "vitest";
import {
  capText,
  safeSerialize,
  clampSandboxTimeout,
  buildSandboxWorkerSource,
  SANDBOX_TIMEOUT_MS,
  SANDBOX_MAX_TIMEOUT_MS,
} from "../app/utils/sandbox.js";

describe("capText", () => {
  it("passes short strings through untouched", () => {
    expect(capText("hello", 10)).toBe("hello");
    expect(capText(12345, 10)).toBe("12345");
  });

  it("truncates with an explicit omission marker", () => {
    const out = capText("x".repeat(100), 10);
    expect(out.startsWith("x".repeat(10))).toBe(true);
    expect(out).toMatch(/\[truncated, 90 chars omitted\]/);
  });

  it("handles the exact boundary", () => {
    expect(capText("12345", 5)).toBe("12345");
    expect(capText("123456", 5)).toContain("[truncated");
  });
});

describe("safeSerialize", () => {
  it("serializes primitives", () => {
    expect(safeSerialize("hi", 100)).toBe("hi");
    expect(safeSerialize(42, 100)).toBe("42");
    expect(safeSerialize(true, 100)).toBe("true");
    expect(safeSerialize(null, 100)).toBe("null");
    expect(safeSerialize(undefined, 100)).toBe("undefined");
    expect(safeSerialize(10n, 100)).toBe("10n");
    expect(safeSerialize(Symbol("tag"), 100)).toBe("Symbol(tag)");
  });

  it("serializes plain objects and arrays", () => {
    expect(safeSerialize({ a: 1, b: "x" }, 1000)).toBe("{ a: 1, b: x }");
    expect(safeSerialize([1, [2, 3]], 1000)).toBe("[1, [2, 3]]");
  });

  it("survives circular references", () => {
    const obj = { self: null };
    obj.self = obj;
    expect(safeSerialize(obj, 1000)).toContain("[circular]");
  });

  it("caps depth and marks functions/errors/big values", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } };
    expect(safeSerialize(deep, 10000)).toContain("[max depth]");

    function namedFn() {}
    expect(safeSerialize(namedFn, 100)).toBe("[Function: namedFn]");
    expect(safeSerialize(() => {}, 100)).toBe("[Function]");

    const err = new TypeError("nope");
    expect(safeSerialize(err, 100)).toBe("TypeError: nope");
  });

  it("renders Map/Set/Date usefully", () => {
    expect(safeSerialize(new Map([["k", 1]]), 1000)).toBe("Map(1) { k => 1 }");
    expect(safeSerialize(new Set([1, 2]), 1000)).toBe("Set(2) { 1, 2 }");
    expect(safeSerialize(new Date("2026-01-02T00:00:00Z"), 1000)).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  it("applies the overall character cap", () => {
    const big = { text: "y".repeat(500) };
    expect(safeSerialize(big, 20).length).toBeLessThanOrEqual(80);
    expect(safeSerialize(big, 20)).toContain("[truncated");
  });
});

describe("clampSandboxTimeout", () => {
  it("falls back to the default for invalid input", () => {
    expect(clampSandboxTimeout(undefined)).toBe(SANDBOX_TIMEOUT_MS);
    expect(clampSandboxTimeout(null)).toBe(SANDBOX_TIMEOUT_MS);
    expect(clampSandboxTimeout(0)).toBe(SANDBOX_TIMEOUT_MS);
    expect(clampSandboxTimeout(-5)).toBe(SANDBOX_TIMEOUT_MS);
    expect(clampSandboxTimeout("abc")).toBe(SANDBOX_TIMEOUT_MS);
  });

  it("clamps to the allowed range and floors fractional values", () => {
    expect(clampSandboxTimeout(500)).toBe(1000);
    expect(clampSandboxTimeout(SANDBOX_MAX_TIMEOUT_MS * 2)).toBe(
      SANDBOX_MAX_TIMEOUT_MS,
    );
    expect(clampSandboxTimeout(2500.9)).toBe(2500);
    expect(clampSandboxTimeout(45000)).toBe(45000);
  });
});

describe("buildSandboxWorkerSource", () => {
  const src = buildSandboxWorkerSource();

  it("blocks network access surfaces", () => {
    expect(src).toContain('__tryDefineGlobal("fetch", __block)');
    expect(src).toContain('__tryDefineGlobal("importScripts", __block)');
    expect(src).toContain('__tryDefineGlobal("XMLHttpRequest", undefined)');
    expect(src).toContain('__tryDefineGlobal("WebSocket", undefined)');
    expect(src).toContain('__tryDefineGlobal("EventSource", undefined)');
    expect(src).toContain('__tryDefineGlobal("Worker", undefined)');
    expect(src).toContain("sendBeacon");
    expect(src).toContain("Network access is disabled");
  });

  it("removes origin-storage escape hatches (critical)", () => {
    // indexedDB and caches share the app's origin storage; OPFS via
    // navigator.storage would expose the real workspace. All must go.
    expect(src).toContain('__tryDefineGlobal("indexedDB", undefined)');
    expect(src).toContain('__tryDefineGlobal("caches", undefined)');
    expect(src).toContain('"storage"');
  });

  it("authenticates the message protocol with a closure-held run token", () => {
    expect(src).toContain("__runToken = data.token");
    expect(src).toContain("token: __runToken");
    // The whole script must be wrapped in an IIFE so internals stay
    // closure-bound (global lexical bindings ARE visible to new Function).
    expect(src.startsWith("(function () {")).toBe(true);
    expect(src.endsWith("})();")).toBe(true);
  });

  it("supports top-level await/return and captures console output", () => {
    expect(src).toContain("AsyncFunction");
    for (const lvl of ["log", "info", "warn", "error", "debug", "trace"]) {
      expect(src).toContain(`"${lvl}"`);
    }
    expect(src).toContain("LOG_BUDGET");
  });

  it("embeds serializer behavior markers (parity with exported helpers)", () => {
    expect(src).toContain("[circular]");
    expect(src).toContain("chars omitted]");
  });

  it("exposes the three workspace bridge functions", () => {
    expect(src).toContain('__fsCall("read"');
    expect(src).toContain('__fsCall("write"');
    expect(src).toContain('__fsCall("list"');
  });
});
