import { describe, it, expect } from "vitest";
import { findSnippet, messageText } from "../app/utils/chatSearch.js";

describe("messageText", () => {
  it("reads plain and multi-part content", () => {
    expect(messageText({ role: "user", content: "hello" })).toBe("hello");
    expect(
      messageText({
        role: "user",
        content: [
          { type: "text", text: "look at this" },
          { type: "image_url", image_url: { url: "data:..." } },
          { type: "text", text: "please" },
        ],
      }),
    ).toBe("look at this\nplease");
  });

  it("ignores tool and system messages and missing content", () => {
    expect(messageText({ role: "tool", content: "secret output" })).toBe("");
    expect(messageText({ role: "system", content: "prompt" })).toBe("");
    expect(messageText({ role: "assistant", content: null })).toBe("");
    expect(messageText(null)).toBe("");
  });
});

describe("findSnippet", () => {
  const messages = [
    { role: "user", content: "How do I bake sourdough bread at home?" },
    { role: "assistant", content: "Start with a Sourdough starter.\n\nThen wait." },
  ];

  it("finds the first match regardless of case and keeps the original casing", () => {
    expect(findSnippet(messages, "SOURDOUGH")).toEqual({
      before: "How do I bake ",
      match: "sourdough",
      after: " bread at home?",
    });
  });

  it("looks in later messages and flattens whitespace", () => {
    expect(findSnippet(messages, "then wait")).toEqual({
      before: "…th a Sourdough starter. ",
      match: "Then wait",
      after: ".",
    });
  });

  it("marks text that was cut off on either side", () => {
    const long = `${"a ".repeat(40)}needle${" b".repeat(60)}`;
    const snippet = findSnippet([{ role: "assistant", content: long }], "needle");
    expect(snippet.before.startsWith("…")).toBe(true);
    expect(snippet.after.endsWith("…")).toBe(true);
    expect(snippet.match).toBe("needle");
  });

  it("does not search reasoning or tool output", () => {
    const withExtras = [
      { role: "assistant", content: "answer", reasoning: "hidden thought" },
      { role: "tool", content: "hidden result" },
    ];
    expect(findSnippet(withExtras, "hidden")).toBeNull();
  });

  it("returns null for no match, an empty query or no messages", () => {
    expect(findSnippet(messages, "croissant")).toBeNull();
    expect(findSnippet(messages, "   ")).toBeNull();
    expect(findSnippet(undefined, "bread")).toBeNull();
  });

  it("still matches when lowercasing would change the text length", () => {
    const snippet = findSnippet([{ role: "user", content: "İstanbul trip plan" }], "trip");
    expect(snippet.match).toBe("trip");
    expect(snippet.before).toBe("İstanbul ");
  });
});
