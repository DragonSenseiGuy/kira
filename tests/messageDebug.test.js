/**
 * Tests for app/utils/messageDebug.js — the "Copy debug info" formatter.
 *
 * The point of this dump is diagnostics, not a transcript: it must report
 * timings, usage, part structure and tool calls without pasting the whole
 * message body (let alone pasting it three times over).
 */

import { describe, it, expect } from "vitest";
import { buildMessageDebugDump } from "../app/utils/messageDebug.js";

const LONG = "x".repeat(5000);

describe("buildMessageDebugDump", () => {
  it("returns an empty string for no message", () => {
    expect(buildMessageDebugDump(null)).toBe("");
  });

  it("reports identity, timings and usage", () => {
    const dump = buildMessageDebugDump({
      role: "assistant",
      id: "m1",
      model: "gpt-oss-120b",
      complete: true,
      promptTokens: 120,
      tokenCount: 40,
      totalTokens: 160,
    });

    expect(dump).toContain("role: assistant");
    expect(dump).toContain("id: m1");
    expect(dump).toContain("model: gpt-oss-120b");
    expect(dump).toContain("prompt: 120");
    expect(dump).toContain("total: 160");
  });

  it("truncates a long body instead of copying all of it", () => {
    const dump = buildMessageDebugDump({ role: "assistant", content: LONG });

    expect(dump.length).toBeLessThan(LONG.length);
    expect(dump).toContain("chars omitted");
    expect(dump).toContain("content · 5,000 chars");
  });

  it("copies a short body in full", () => {
    const dump = buildMessageDebugDump({ role: "assistant", content: "hello" });
    expect(dump).toContain("hello");
  });

  it("truncates long reasoning too", () => {
    const dump = buildMessageDebugDump({ role: "assistant", reasoning: LONG });
    expect(dump.length).toBeLessThan(LONG.length);
    expect(dump).toContain("reasoning · 5,000 chars");
  });

  it("summarizes parts by type and size rather than reprinting them", () => {
    const dump = buildMessageDebugDump({
      role: "assistant",
      content: LONG,
      parts: [
        { type: "reasoning", content: LONG },
        { type: "content", content: LONG },
        { type: "image", images: [{ url: "data:image/png;base64,AAAA" }] },
      ],
    });

    expect(dump).toContain("[0] reasoning · 5,000 chars");
    expect(dump).toContain("[1] content · 5,000 chars");
    expect(dump).toContain("[2] image · 1");
    // The body appears at most once, as a single truncated preview.
    expect(dump.length).toBeLessThan(LONG.length);
  });

  it("keeps tool call detail, with long results previewed", () => {
    const dump = buildMessageDebugDump({
      role: "assistant",
      parts: [
        {
          type: "tool_group",
          tools: [
            {
              id: "call_1",
              function: { name: "read_file", arguments: '{"path":"a.md"}' },
              result: LONG,
            },
          ],
        },
      ],
    });

    expect(dump).toContain("[0] tools · 1");
    expect(dump).toContain("read_file");
    expect(dump).toContain('"path": "a.md"');
    expect(dump).toContain("chars omitted");
    expect(dump.length).toBeLessThan(LONG.length);
  });

  it("still reports legacy tool_calls", () => {
    const dump = buildMessageDebugDump({
      role: "assistant",
      tool_calls: [{ id: "t1", function: { name: "search", arguments: "{}" } }],
    });

    expect(dump).toContain("TOOL_CALLS");
    expect(dump).toContain("search");
  });

  it("reports error details", () => {
    const dump = buildMessageDebugDump({
      role: "assistant",
      errorDetails: { name: "HTTPError", message: "rate limited", status: 429 },
    });

    expect(dump).toContain("HTTPError: rate limited (HTTP 429)");
  });

  it("reports a body once, not alongside its mirror in parts", () => {
    // `parts` is canonical; message.content is the flat mirror written
    // beside it during streaming. Reporting both would double-count.
    const dump = buildMessageDebugDump({
      role: "assistant",
      content: "hello world",
      parts: [{ type: "content", content: "hello world" }],
    });

    expect(dump.match(/hello world/g)).toHaveLength(1);
    expect(dump).not.toContain("==== CONTENT ====");
  });

  it("falls back to the flat body when a legacy message has no parts", () => {
    const dump = buildMessageDebugDump({ role: "assistant", content: "hello" });
    expect(dump).toContain("==== CONTENT ====");
    expect(dump).toContain("hello");
  });

  it("does not embed a raw JSON copy of the message", () => {
    const dump = buildMessageDebugDump({
      role: "assistant",
      content: "hi",
      attachments: [{ dataUrl: "data:image/png;base64,SECRETPAYLOAD" }],
    });

    expect(dump).not.toContain("RAW JSON");
    expect(dump).not.toContain("SECRETPAYLOAD");
  });
});
