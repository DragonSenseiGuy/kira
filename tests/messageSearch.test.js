/**
 * Tests for app/composables/messageSearch.js
 *
 * The search module turns stored conversations into ranked, snippet-highlighted
 * hits. These tests pin down the text-extraction rules (parts vs. legacy
 * content, reasoning opt-in), the AND matching semantics, snippet windowing,
 * and the index-building shape the palette consumes.
 */

import { describe, it, expect } from "vitest";
import {
  getMessageText,
  tokenizeQuery,
  findMatchRanges,
  scoreMatch,
  buildSnippet,
  snippetSegments,
  buildConversationIndex,
  searchConversations,
} from "../app/composables/messageSearch.js";

describe("getMessageText", () => {
  it("returns the content of a plain user message", () => {
    expect(getMessageText({ role: "user", content: "hello world" })).toBe("hello world");
  });

  it("returns an empty string for null-ish input", () => {
    expect(getMessageText(null)).toBe("");
    expect(getMessageText(undefined)).toBe("");
    expect(getMessageText({})).toBe("");
  });

  it("prefers a pre-extracted text field", () => {
    const message = { role: "user", text: "indexed", content: "raw" };
    expect(getMessageText(message)).toBe("indexed");
  });

  it("extracts text segments from multimodal content arrays", () => {
    const message = {
      role: "user",
      content: [
        { type: "text", text: "describe this" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
      ],
    };
    expect(getMessageText(message)).toBe("describe this");
  });

  it("concatenates assistant content parts and skips reasoning by default", () => {
    const message = {
      role: "assistant",
      parts: [
        { type: "reasoning", content: "let me think about pelicans" },
        { type: "content", content: "first half" },
        { type: "tool_group", tools: [{ function: { name: "search" } }] },
        { type: "content", content: "second half" },
      ],
    };

    const text = getMessageText(message);
    expect(text).toContain("first half");
    expect(text).toContain("second half");
    expect(text).not.toContain("pelicans");
  });

  it("includes reasoning when explicitly requested", () => {
    const message = {
      role: "assistant",
      parts: [
        { type: "reasoning", content: "let me think about pelicans" },
        { type: "content", content: "answer" },
      ],
    };
    expect(getMessageText(message, { includeReasoning: true })).toContain("pelicans");
  });

  it("falls back to legacy content when parts hold no prose", () => {
    const message = {
      role: "assistant",
      parts: [{ type: "tool_group", tools: [] }],
      content: "legacy body",
    };
    expect(getMessageText(message)).toBe("legacy body");
  });

  it("includes attachment filenames so files are findable by name", () => {
    const message = {
      role: "user",
      content: "check this",
      attachments: [{ type: "pdf", filename: "quarterly-report.pdf" }],
    };
    expect(getMessageText(message)).toContain("quarterly-report.pdf");
  });

  it("never leaks attachment data URLs into the searchable text", () => {
    const message = {
      role: "user",
      content: "look",
      attachments: [{ type: "image", filename: "a.png", dataUrl: "data:image/png;base64,SECRET" }],
    };
    expect(getMessageText(message)).not.toContain("SECRET");
  });
});

describe("tokenizeQuery", () => {
  it("splits on whitespace and lowercases", () => {
    expect(tokenizeQuery("Hello World")).toEqual({
      terms: ["hello", "world"],
      phrases: [],
    });
  });

  it("keeps quoted phrases together", () => {
    const result = tokenizeQuery('sonnet "context compression" fast');
    expect(result.terms).toEqual(["sonnet", "context compression", "fast"]);
    expect(result.phrases).toEqual(["context compression"]);
  });

  it("de-duplicates repeated terms", () => {
    expect(tokenizeQuery("cat cat dog").terms).toEqual(["cat", "dog"]);
  });

  it("returns empty results for blank or non-string input", () => {
    expect(tokenizeQuery("   ")).toEqual({ terms: [], phrases: [] });
    expect(tokenizeQuery(null)).toEqual({ terms: [], phrases: [] });
  });

  it("ignores empty quotes", () => {
    expect(tokenizeQuery('"" hello').terms).toEqual(["hello"]);
  });
});

describe("findMatchRanges", () => {
  it("finds every occurrence of a term", () => {
    expect(findMatchRanges("aXaXa", ["a"])).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
  });

  it("is case insensitive", () => {
    expect(findMatchRanges("Hello", ["hello"])).toEqual([{ start: 0, end: 5 }]);
  });

  it("merges overlapping ranges from different terms", () => {
    // "ell" and "llo" overlap inside "hello".
    expect(findMatchRanges("hello", ["ell", "llo"])).toEqual([{ start: 1, end: 5 }]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(findMatchRanges("hello", ["zzz"])).toEqual([]);
    expect(findMatchRanges("", ["a"])).toEqual([]);
    expect(findMatchRanges("hello", [])).toEqual([]);
  });
});

describe("scoreMatch", () => {
  it("scores zero when any term is missing (AND semantics)", () => {
    expect(scoreMatch("the quick brown fox", ["quick", "zebra"])).toBe(0);
  });

  it("scores above zero when every term is present", () => {
    expect(scoreMatch("the quick brown fox", ["quick", "fox"])).toBeGreaterThan(0);
  });

  it("ranks whole-word matches above incidental substrings", () => {
    const wholeWord = scoreMatch("this is art today", ["art"]);
    const substring = scoreMatch("this is started today", ["art"]);
    expect(wholeWord).toBeGreaterThan(substring);
  });

  it("ranks clustered terms above scattered ones", () => {
    const clustered = scoreMatch("alpha beta", ["alpha", "beta"]);
    const scattered = scoreMatch(`alpha ${"filler ".repeat(40)} beta`, ["alpha", "beta"]);
    expect(clustered).toBeGreaterThan(scattered);
  });

  it("ranks repeated mentions above a single mention", () => {
    const once = scoreMatch("kira is here. more text follows in this line.", ["kira"]);
    const thrice = scoreMatch("kira kira kira. more text follows in this line.", ["kira"]);
    expect(thrice).toBeGreaterThan(once);
  });

  it("returns zero for empty inputs", () => {
    expect(scoreMatch("", ["a"])).toBe(0);
    expect(scoreMatch("hello", [])).toBe(0);
  });
});

describe("buildSnippet", () => {
  it("returns the whole text when it fits", () => {
    const snippet = buildSnippet("short text about cats", ["cats"]);
    expect(snippet.text).toBe("short text about cats");
    expect(snippet.prefixed).toBe(false);
    expect(snippet.suffixed).toBe(false);
  });

  it("collapses whitespace", () => {
    expect(buildSnippet("a  \n\n b", ["a"]).text).toBe("a b");
  });

  it("windows long text around the first match", () => {
    const text = `${"filler ".repeat(60)}NEEDLE${" trailing".repeat(60)}`;
    const snippet = buildSnippet(text, ["needle"], { maxLength: 100 });

    expect(snippet.text.length).toBeLessThanOrEqual(100);
    expect(snippet.text.toLowerCase()).toContain("needle");
    expect(snippet.prefixed).toBe(true);
    expect(snippet.suffixed).toBe(true);
  });

  it("reports ranges relative to the snippet, not the source text", () => {
    const text = `${"filler ".repeat(60)}NEEDLE tail`;
    const snippet = buildSnippet(text, ["needle"], { maxLength: 100 });
    const range = snippet.ranges[0];

    expect(snippet.text.slice(range.start, range.end).toLowerCase()).toBe("needle");
  });

  it("handles empty text", () => {
    expect(buildSnippet("", ["a"])).toEqual({
      text: "",
      ranges: [],
      prefixed: false,
      suffixed: false,
    });
  });

  it("still produces a snippet when nothing matches", () => {
    const snippet = buildSnippet("a".repeat(500), ["zzz"], { maxLength: 50 });
    expect(snippet.text.length).toBeLessThanOrEqual(50);
    expect(snippet.ranges).toEqual([]);
  });
});

describe("snippetSegments", () => {
  it("splits a snippet into plain and matched segments", () => {
    const segments = snippetSegments({
      text: "hello world",
      ranges: [{ start: 6, end: 11 }],
    });

    expect(segments).toEqual([
      { text: "hello ", match: false },
      { text: "world", match: true },
    ]);
  });

  it("returns a single plain segment when there are no ranges", () => {
    expect(snippetSegments({ text: "hello", ranges: [] })).toEqual([
      { text: "hello", match: false },
    ]);
  });

  it("reconstructs the original text exactly", () => {
    const snippet = buildSnippet("the quick brown fox jumps", ["quick", "fox"]);
    const rebuilt = snippetSegments(snippet).map((s) => s.text).join("");
    expect(rebuilt).toBe(snippet.text);
  });

  it("returns an empty array for empty input", () => {
    expect(snippetSegments(null)).toEqual([]);
    expect(snippetSegments({ text: "" })).toEqual([]);
  });
});

describe("buildConversationIndex", () => {
  const record = {
    title: "Pelican facts",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    messages: [
      { id: "m1", role: "user", content: "tell me about pelicans" },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "content", content: "Pelicans have large bills." }],
      },
      { id: "m3", role: "tool", tool_call_id: "t1", content: '{"results":[]}' },
      { id: "m4", role: "user", content: "   " },
    ],
  };

  it("keeps only searchable roles with non-empty text", () => {
    const index = buildConversationIndex("c1", record);
    expect(index.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("carries conversation metadata through", () => {
    const index = buildConversationIndex("c1", record);
    expect(index.id).toBe("c1");
    expect(index.title).toBe("Pelican facts");
    expect(index.lastUpdated).toBe("2026-01-01T00:00:00.000Z");
  });

  it("defaults a missing title to Untitled", () => {
    expect(buildConversationIndex("c1", { messages: [] }).title).toBe("Untitled");
  });

  it("tolerates a missing record", () => {
    const index = buildConversationIndex("c1", null);
    expect(index.messages).toEqual([]);
  });

  it("drops attachment payloads from the index", () => {
    const index = buildConversationIndex("c1", {
      messages: [
        {
          id: "m1",
          role: "user",
          content: "look",
          attachments: [{ filename: "a.png", dataUrl: "data:image/png;base64,HUGE" }],
        },
      ],
    });
    expect(JSON.stringify(index)).not.toContain("HUGE");
  });
});

describe("searchConversations", () => {
  const conversations = [
    {
      id: "c1",
      title: "Rust ownership",
      lastUpdated: "2026-01-02T00:00:00.000Z",
      messages: [
        { id: "a1", role: "user", text: "explain rust ownership rules" },
        { id: "a2", role: "assistant", text: "Ownership means each value has one owner." },
      ],
    },
    {
      id: "c2",
      title: "Dinner ideas",
      lastUpdated: "2026-01-03T00:00:00.000Z",
      messages: [
        { id: "b1", role: "user", text: "what should I cook tonight" },
        { id: "b2", role: "assistant", text: "Try a mushroom risotto." },
      ],
    },
  ];

  it("returns matching messages with conversation context", () => {
    const results = searchConversations(conversations, "ownership");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].conversationId).toBe("c1");
    expect(results[0].conversationTitle).toBe("Rust ownership");
    expect(results[0].snippet.text.toLowerCase()).toContain("ownership");
  });

  it("requires all terms to be present in the same message", () => {
    expect(searchConversations(conversations, "ownership risotto")).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchConversations(conversations, "")).toEqual([]);
    expect(searchConversations(conversations, "   ")).toEqual([]);
  });

  it("tolerates malformed input", () => {
    expect(searchConversations(null, "hi")).toEqual([]);
    expect(searchConversations([null, { id: "x" }], "hi")).toEqual([]);
  });

  it("caps results per conversation", () => {
    const spammy = [
      {
        id: "c3",
        title: "Repeats",
        messages: Array.from({ length: 10 }, (_, i) => ({
          id: `r${i}`,
          role: "user",
          text: `needle number ${i}`,
        })),
      },
    ];
    const results = searchConversations(spammy, "needle", { perConversation: 2 });
    expect(results).toHaveLength(2);
  });

  it("caps total results", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `conv${i}`,
      title: `Conv ${i}`,
      messages: [{ id: `m${i}`, role: "user", text: "needle" }],
    }));
    expect(searchConversations(many, "needle", { limit: 5 })).toHaveLength(5);
  });

  it("orders results by score, then by recency", () => {
    const tied = [
      { id: "old", title: "Old", lastUpdated: "2026-01-01T00:00:00.000Z", messages: [{ id: "o", role: "user", text: "needle" }] },
      { id: "new", title: "New", lastUpdated: "2026-06-01T00:00:00.000Z", messages: [{ id: "n", role: "user", text: "needle" }] },
    ];
    expect(searchConversations(tied, "needle")[0].conversationId).toBe("new");
  });

  it("exposes the message id so results can deep-link", () => {
    const [result] = searchConversations(conversations, "risotto");
    expect(result.messageId).toBe("b2");
    expect(result.role).toBe("assistant");
  });

  it("searches raw stored messages, not just pre-built index entries", () => {
    const raw = [
      {
        id: "c9",
        title: "Raw",
        messages: [
          { id: "m1", role: "assistant", parts: [{ type: "content", content: "quantum tunnelling" }] },
        ],
      },
    ];
    expect(searchConversations(raw, "tunnelling")).toHaveLength(1);
  });
});
