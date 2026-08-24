/**
 * Tests for app/utils/mentions.js — @file reference parsing.
 *
 * Behavior contract:
 *   - @token is a mention only when preceded by start/whitespace and NOT
 *     by a backslash ( \@ escapes a literal @)
 *   - resolution counts only paths that exist in the workspace
 *   - emails like a@b.c never produce tokens (no whitespace before @)
 */

import { describe, it, expect } from "vitest";
import {
  buildKnownPaths,
  backspaceTarget,
  deleteTarget,
  filterMentionFiles,
  findMentionSpans,
  scanMentionTokens,
  resolveMentions,
  formatAttachedFiles,
  MAX_ATTACHED_FILE_CHARS,
  MENTION_TRIGGER_RE,
} from "../app/utils/mentions";

const KNOWN = new Set(["notes.md", "data/words.csv", "projects/radar/brief.md"]);

describe("buildKnownPaths", () => {
  it("prefixes project files with projects/<name>/", () => {
    const set = buildKnownPaths(
      [{ path: "a.md" }],
      { radar: [{ path: "b.md" }, { path: "sub/c.md" }] },
    );
    expect(set.has("a.md")).toBe(true);
    expect(set.has("projects/radar/b.md")).toBe(true);
    expect(set.has("projects/radar/sub/c.md")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("tolerates empty inputs", () => {
    expect(buildKnownPaths().size).toBe(0);
    expect(buildKnownPaths(null, null).size).toBe(0);
  });
});

describe("scanMentionTokens", () => {
  it("finds tokens at start and after whitespace", () => {
    const tokens = scanMentionTokens("see @notes.md and @data/words.csv please");
    expect(tokens.map((t) => t.path)).toEqual(["notes.md", "data/words.csv"]);
  });

  it("ignores emails and mid-word @", () => {
    expect(scanMentionTokens("mail me at a@b.com")).toHaveLength(0);
    expect(scanMentionTokens("weird@token")).toHaveLength(0);
  });

  it("skips escaped \\@ sequences", () => {
    expect(scanMentionTokens("literal \\@notes.md here")).toHaveLength(0);
    const mixed = scanMentionTokens("\\@fake @notes.md");
    expect(mixed.map((t) => t.path)).toEqual(["notes.md"]);
  });

  it("stops tokens at whitespace", () => {
    expect(scanMentionTokens("@notes.md, right?")[0].path).toBe("notes.md");
  });
});

describe("resolveMentions", () => {
  it("returns only paths that exist, deduped, in order", () => {
    const { mentions } = resolveMentions(
      "@notes.md plus @ghost.md plus @notes.md plus @projects/radar/brief.md",
      KNOWN,
    );
    expect(mentions).toEqual(["notes.md", "projects/radar/brief.md"]);
  });

  it("unescapes \\@ into a literal @ in cleanText", () => {
    const { cleanText, mentions } = resolveMentions("use \\@ to mention", KNOWN);
    expect(cleanText).toBe("use @ to mention");
    expect(mentions).toEqual([]);
  });

  it("leaves unknown @tokens as plain text (no attachment by surprise)", () => {
    const { cleanText, mentions } = resolveMentions("ping @nonexistent.md", KNOWN);
    expect(mentions).toEqual([]);
    expect(cleanText).toBe("ping @nonexistent.md");
  });

  it("handles empty/null text", () => {
    expect(resolveMentions("", KNOWN).mentions).toEqual([]);
    expect(resolveMentions(null, KNOWN).cleanText).toBe("");
  });
});

describe("MENTION_TRIGGER_RE (autocomplete trigger)", () => {
  function trigger(text) {
    return MENTION_TRIGGER_RE.exec(text)?.[1] ?? null;
  }

  it("matches @ at start or after whitespace, capturing the query", () => {
    expect(trigger("@")).toBe("");
    expect(trigger("@no")).toBe("no");
    expect(trigger("hello @data/wo")).toBe("data/wo");
  });

  it("does not trigger mid-word or after an escape", () => {
    expect(trigger("a@b")).toBeNull();
    expect(trigger("escaped \\@no")).toBeNull();
  });
});

describe("filterMentionFiles (autocomplete search)", () => {
  const chat = [
    { path: "reports/summary.md" },
    { path: "notes.md" },
    { path: "data/words.csv" },
  ];
  const projects = { radar: [{ path: "README.md" }, { path: "data/raw.csv" }] };

  it("empty query lists everything (chat files first, then projects)", () => {
    const items = filterMentionFiles(chat, projects, "");
    expect(items.map((i) => i.path)).toEqual([
      "reports/summary.md",
      "notes.md",
      "data/words.csv",
      "projects/radar/README.md",
      "projects/radar/data/raw.csv",
    ]);
  });

  it("substring-matches case-insensitively", () => {
    const items = filterMentionFiles(chat, projects, "WORDS");
    expect(items.map((i) => i.path)).toEqual(["data/words.csv"]);
  });

  it("ranks prefix matches before later matches, then earlier, then A→Z", () => {
    const files = [
      { path: "zz/mymatch.md" },   // later match
      { path: "mymatch.md" },      // prefix match
      { path: "a/mymatch.txt" },   // later match, alphabetically first
    ];
    const items = filterMentionFiles(files, {}, "my");
    expect(items.map((i) => i.path)).toEqual([
      "mymatch.md",       // startsWith wins
      "a/mymatch.txt",    // same position, A→Z
      "zz/mymatch.md",
    ]);
  });

  it("searches project files by their full prefixed path", () => {
    const items = filterMentionFiles([], projects, "radar/read");
    expect(items.map((i) => i.path)).toEqual(["projects/radar/README.md"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.md` }));
    expect(filterMentionFiles(many, {}, "")).toHaveLength(8);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterMentionFiles(chat, projects, "zzz-not-there")).toEqual([]);
  });
});

describe("findMentionSpans (atomic token editing)", () => {
  it("locates only resolvable tokens with exact indices", () => {
    const text = "see @notes.md and @ghost.md plus @projects/radar/brief.md";
    const spans = findMentionSpans(text, KNOWN);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({ start: 4, end: 13, path: "notes.md" });
    expect(text.slice(spans[1].start, spans[1].end)).toBe("@projects/radar/brief.md");
  });

  it("spans cover the @ and exclude the terminating space", () => {
    const text = "@notes.md rest";
    const [span] = findMentionSpans(text, KNOWN);
    expect(text.slice(span.start, span.end)).toBe("@notes.md");
    expect(text[span.end]).toBe(" ");
  });

  it("handles adjacent tokens and escapes", () => {
    const spans = findMentionSpans("@notes.md \\@notes.md @notes.md", KNOWN);
    expect(spans).toHaveLength(2);
    expect(spans[0].start).toBe(0);
    expect(spans[1].start).toBe(21);
  });

  it("returns empty arrays safely", () => {
    expect(findMentionSpans("", KNOWN)).toEqual([]);
    expect(findMentionSpans(null, KNOWN)).toEqual([]);
    expect(findMentionSpans("@notes.md", new Set())).toEqual([]);
  });
});

describe("backspaceTarget / deleteTarget (caret-edge semantics)", () => {
  // One chip at indices 0..10 ("@notes.md" + trailing space at 10).
  const spans = [{ start: 0, end: 9, path: "notes.md" }];

  it("backspace at the chip's LEFT edge → null (default: delete char behind)", () => {
    expect(backspaceTarget(spans, 0)).toBeNull();
  });

  it("backspace with a space between caret and chip → null (space goes first)", () => {
    expect(backspaceTarget(spans, 10)).toBeNull();
  });

  it("backspace at the chip's RIGHT edge → atomic removal", () => {
    expect(backspaceTarget(spans, 9)).toBe(spans[0]);
  });

  it("backspace inside the chip → atomic removal", () => {
    expect(backspaceTarget(spans, 5)).toBe(spans[0]);
  });

  it("backspace elsewhere in the text → null", () => {
    expect(backspaceTarget(spans, 15)).toBeNull();
  });

  it("delete at the chip's LEFT edge → atomic removal", () => {
    expect(deleteTarget(spans, 0)).toBe(spans[0]);
  });

  it("delete inside the chip → atomic removal", () => {
    expect(deleteTarget(spans, 4)).toBe(spans[0]);
  });

  it("delete at the chip's RIGHT edge → null (trailing space goes first)", () => {
    expect(deleteTarget(spans, 9)).toBeNull();
  });
});

describe("formatAttachedFiles", () => {
  it("wraps each read file in an attached_file block with its path", () => {
    const out = formatAttachedFiles([
      { path: "notes.md", content: "# hello" },
      { path: "projects/radar/data/w.csv", content: "a,b" },
    ]);
    expect(out).toContain('<attached_file path="notes.md">\n# hello\n</attached_file>');
    expect(out).toContain('<attached_file path="projects/radar/data/w.csv">\na,b\n</attached_file>');
    expect(out.indexOf("notes.md")).toBeLessThan(out.indexOf("radar/data/w.csv"));
  });

  it("skips failed reads (null content) so their path stays a retryable pointer", () => {
    const out = formatAttachedFiles([
      { path: "gone.md", content: null },
      { path: "ok.md", content: "hi" },
    ]);
    expect(out).not.toContain("gone.md");
    expect(out).toContain("ok.md");
  });

  it("truncates oversized contents with a marker", () => {
    const big = "x".repeat(MAX_ATTACHED_FILE_CHARS + 500);
    const out = formatAttachedFiles([{ path: "big.txt", content: big }]);
    expect(out).toContain("[…file truncated…]");
    expect(out.length).toBeLessThan(big.length + 200);
  });

  it("escapes double quotes in paths (attribute safety)", () => {
    const out = formatAttachedFiles([{ path: 'we"ird.md', content: "x" }]);
    expect(out).toContain('path="we&quot;ird.md"');
  });

  it("returns an empty string when nothing is attachable", () => {
    expect(formatAttachedFiles([])).toBe("");
    expect(formatAttachedFiles([{ path: "x", content: null }])).toBe("");
  });
});
