/**
 * Tests for app/utils/fuzzyMatch.js
 *
 * The fuzzy matcher powers the command palette's ranking. These tests lock in
 * the ordering guarantees that make the palette feel right: exact substrings
 * beat scattered subsequences, prefixes beat mid-string hits, and word-boundary
 * initials ("cp" → "Command Palette") rank highly.
 */

import { describe, it, expect } from "vitest";
import { fuzzyMatch, fuzzyFilter, highlightSegments } from "../app/utils/fuzzyMatch.js";

describe("fuzzyMatch", () => {
  it("matches an exact substring and reports its positions", () => {
    const result = fuzzyMatch("Command Palette", "palette");
    expect(result).not.toBeNull();
    expect(result.positions).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });

  it("matches a scattered subsequence", () => {
    const result = fuzzyMatch("Command Palette", "cmdp");
    expect(result).not.toBeNull();
    expect(result.positions).toHaveLength(4);
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("Command Palette", "zzz")).toBeNull();
  });

  it("returns a zero score for an empty query", () => {
    expect(fuzzyMatch("anything", "")).toEqual({ score: 0, positions: [] });
  });

  it("returns null for non-string input", () => {
    expect(fuzzyMatch(null, "a")).toBeNull();
    expect(fuzzyMatch(undefined, "a")).toBeNull();
  });

  it("is case insensitive", () => {
    expect(fuzzyMatch("Command Palette", "COMMAND")).not.toBeNull();
  });

  it("ranks an exact substring above a scattered subsequence", () => {
    const exact = fuzzyMatch("new chat", "chat").score;
    const scattered = fuzzyMatch("copy html attachment", "chat").score;
    expect(exact).toBeGreaterThan(scattered);
  });

  it("ranks a prefix match above a mid-string match", () => {
    const prefix = fuzzyMatch("settings panel", "sett").score;
    const middle = fuzzyMatch("open the settings", "sett").score;
    expect(prefix).toBeGreaterThan(middle);
  });

  it("ranks word-boundary initials highly", () => {
    const initials = fuzzyMatch("Toggle Incognito", "ti").score;
    const incidental = fuzzyMatch("Contribution list", "ti").score;
    expect(initials).toBeGreaterThan(incidental);
  });

  it("prefers shorter candidates for the same match", () => {
    const short = fuzzyMatch("Export chat", "export").score;
    const long = fuzzyMatch("Export chat as a zip archive with attachments", "export").score;
    expect(short).toBeGreaterThan(long);
  });

  it("ignores spaces in the query when walking a subsequence", () => {
    expect(fuzzyMatch("Toggle Incognito Mode", "tog inc")).not.toBeNull();
  });

  it("returns ascending positions", () => {
    const { positions } = fuzzyMatch("abcdef", "ace");
    expect(positions).toEqual([0, 2, 4]);
  });
});

describe("fuzzyFilter", () => {
  const items = [
    { label: "New chat" },
    { label: "New incognito chat" },
    { label: "Open settings" },
    { label: "Toggle sidebar" },
  ];

  it("returns everything untouched for an empty query", () => {
    const result = fuzzyFilter(items, "");
    expect(result).toHaveLength(4);
    expect(result[0].item).toBe(items[0]);
    expect(result[0].score).toBe(0);
  });

  it("filters out non-matching items", () => {
    const labels = fuzzyFilter(items, "settings").map((r) => r.item.label);
    expect(labels).toEqual(["Open settings"]);
  });

  it("sorts by descending score", () => {
    const result = fuzzyFilter(items, "new");
    expect(result).toHaveLength(2);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  it("respects the limit", () => {
    expect(fuzzyFilter(items, "", { limit: 2 })).toHaveLength(2);
    expect(fuzzyFilter(items, "chat", { limit: 1 })).toHaveLength(1);
  });

  it("supports a custom key extractor", () => {
    const conversations = [{ title: "Rust ownership" }, { title: "Dinner ideas" }];
    const result = fuzzyFilter(conversations, "rust", { key: (c) => c.title });
    expect(result).toHaveLength(1);
    expect(result[0].item.title).toBe("Rust ownership");
  });

  it("tolerates non-array input", () => {
    expect(fuzzyFilter(null, "x")).toEqual([]);
  });
});

describe("highlightSegments", () => {
  it("marks matched characters", () => {
    expect(highlightSegments("chat", [0, 1])).toEqual([
      { text: "ch", match: true },
      { text: "at", match: false },
    ]);
  });

  it("handles non-contiguous positions", () => {
    expect(highlightSegments("abc", [0, 2])).toEqual([
      { text: "a", match: true },
      { text: "b", match: false },
      { text: "c", match: true },
    ]);
  });

  it("returns one plain segment when there are no positions", () => {
    expect(highlightSegments("abc", [])).toEqual([{ text: "abc", match: false }]);
  });

  it("returns an empty array for empty text", () => {
    expect(highlightSegments("", [0])).toEqual([]);
    expect(highlightSegments(null, [0])).toEqual([]);
  });

  it("reconstructs the original text", () => {
    const text = "Toggle Incognito";
    const { positions } = fuzzyMatch(text, "ti");
    expect(highlightSegments(text, positions).map((s) => s.text).join("")).toBe(text);
  });
});
