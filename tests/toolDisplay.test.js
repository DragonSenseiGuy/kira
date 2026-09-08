/**
 * Tests for app/utils/toolDisplay.js — widget presentation helpers.
 */

import { describe, it, expect } from "vitest";
import {
  TOOL_DISPLAY,
  getToolDisplay,
  prettifyToolName,
  parseToolJson,
  parsePartialToolArgs,
  toolHeaderDetail,
  parseRunResult,
  formatBytes,
} from "../app/utils/toolDisplay.js";

describe("getToolDisplay", () => {
  it("returns human titles and icons for sandbox/workspace tools", () => {
    expect(getToolDisplay("run_javascript")).toMatchObject({
      title: "Run Code",
      kind: "code",
    });
    expect(getToolDisplay("write_file").title).toBe("Write File");
    expect(getToolDisplay("read_file").title).toBe("Read File");
    expect(getToolDisplay("list_files").title).toBe("List Files");
    expect(getToolDisplay("search").title).toBe("Web Search");
    expect(getToolDisplay("getPageContents").title).toBe("Read Web Pages");

    // Every known entry carries an icon.
    for (const key of Object.keys(TOOL_DISPLAY)) {
      expect(TOOL_DISPLAY[key].icon).toMatch(/^material-symbols:/);
    }
  });

  it("falls back to prettified names and a generic icon", () => {
    const d = getToolDisplay("someFuture_tool");
    expect(d.title).toBe("Some Future tool");
    expect(d.kind).toBe("generic");
    expect(d.icon).toContain("build-circle-outline");
  });

  it("routes memory tools to the memory kind", () => {
    expect(getToolDisplay("addMemory").kind).toBe("memory");
    expect(getToolDisplay("addMemory").icon).toContain("psychology");
  });
});

describe("prettifyToolName", () => {
  it("handles snake_case and camelCase", () => {
    expect(prettifyToolName("run_javascript")).toBe("Run javascript");
    expect(prettifyToolName("someFuture_tool")).toBe("Some Future tool");
    expect(prettifyToolName("getPageContents")).toBe("Get Page Contents");
  });

  it("is robust against junk input", () => {
    expect(prettifyToolName("")).toBe("Tool");
    expect(prettifyToolName(null)).toBe("Tool");
  });
});

describe("parseToolJson", () => {
  it("parses valid objects and rejects everything else", () => {
    expect(parseToolJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolJson("not json")).toEqual({});
    expect(parseToolJson(null)).toEqual({});
    expect(parseToolJson("[1,2]")).toEqual({}); // non-object payloads rejected
  });
});

describe("parsePartialToolArgs (streaming tool calls)", () => {
  it("passes complete JSON through with complete=true", () => {
    const r = parsePartialToolArgs('{"path":"a.md","content":"hi"}');
    expect(r.complete).toBe(true);
    expect(r.args).toEqual({ path: "a.md", content: "hi" });
  });

  it("salvages fields from truncated JSON mid-string", () => {
    const streamed = '{"path":"src/app.js","content":"console.log(1);\\nconst x =';
    const { args, complete } = parsePartialToolArgs(streamed);
    expect(complete).toBe(false);
    expect(args.path).toBe("src/app.js");
    expect(args.content).toBe('console.log(1);\nconst x =');
  });

  it("handles escaped quotes inside truncated content", () => {
    const streamed = '{"path":"x.txt","content":"say \\"hi\\" then more';
    const { args } = parsePartialToolArgs(streamed);
    expect(args.content).toBe('say "hi" then more');
  });

  it("captures numbers and booleans already streamed", () => {
    const { args, complete } = parsePartialToolArgs(
      '{"timeout_ms":45000,"append":true,"path":"a',
    );
    expect(complete).toBe(false);
    expect(args.timeout_ms).toBe(45000);
    expect(args.append).toBe(true);
    expect(args.path).toBe("a");
  });

  it("returns empty for junk/non-strings", () => {
    expect(parsePartialToolArgs(null).args).toEqual({});
    expect(parsePartialToolArgs("").complete).toBe(true);
    const r = parsePartialToolArgs('"just a string');
    expect(r.complete).toBe(false);
    expect(r.args).toEqual({});
  });
});

describe("toolHeaderDetail", () => {
  it("extracts the first meaningful code line for run_javascript", () => {
    const detail = toolHeaderDetail(
      "run_javascript",
      JSON.stringify({ code: "// compute\nconst x = fibonacci(30);\nreturn x;" }),
    );
    expect(detail).toBe("const x = fibonacci(30);");
  });

  it("collapses long single-line code with an ellipsis", () => {
    const detail = toolHeaderDetail(
      "run_javascript",
      JSON.stringify({ code: "return " + "x".repeat(120) + ";" }),
    );
    expect(detail.length).toBeLessThanOrEqual(43);
    expect(detail.endsWith("…")).toBe(true);
  });

  it("shows paths for workspace tools", () => {
    expect(toolHeaderDetail("write_file", JSON.stringify({ path: "src/app.js" }))).toBe("src/app.js");
    expect(toolHeaderDetail("read_file", JSON.stringify({ path: "notes/a.md" }))).toBe("notes/a.md");
    // list_files intentionally shows no header detail (path shown inside).
    expect(toolHeaderDetail("list_files", JSON.stringify({ path: "x" }))).toBe("");
  });

  it("returns nothing for other tools", () => {
    expect(toolHeaderDetail("search", '{"q":"x"}')).toBe("");
    expect(toolHeaderDetail("unknown_tool", "{}")).toBe("");
  });
});

describe("parseRunResult", () => {
  it("reports running when there is no result yet", () => {
    expect(parseRunResult(null).state).toBe("running");
    expect(parseRunResult(undefined).state).toBe("running");
  });

  it("parses successful runs with value and logs", () => {
    const r = parseRunResult(
      JSON.stringify({ ok: true, result: "42", hasResult: true, logs: ["log: hi"] }),
    );
    expect(r.state).toBe("ok");
    expect(r.valueText).toBe("42");
    expect(r.logs).toEqual(["log: hi"]);
  });

  it("treats ok-without-value as success without output", () => {
    const r = parseRunResult(JSON.stringify({ ok: true, result: null, hasResult: false, logs: [] }));
    expect(r.state).toBe("ok");
    expect(r.valueText).toBeNull();
  });

  it("parses failures and timeouts", () => {
    const err = parseRunResult(
      JSON.stringify({ ok: false, error: "TypeError: boom", logs: [] }),
    );
    expect(err.state).toBe("error");
    expect(err.error).toContain("boom");

    const timeout = parseRunResult(
      JSON.stringify({ ok: false, timedOut: true, error: "timed out", logs: ["log: partial"] }),
    );
    expect(timeout.state).toBe("timeout");
    expect(timeout.logs).toHaveLength(1);
  });
});

describe("formatBytes", () => {
  it("formats human-readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(NaN)).toBe("");
  });
});

