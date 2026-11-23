import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatQuote, insertQuote, quotableSelection, quoteButtonPosition, MAX_QUOTE_LENGTH } from "../app/utils/quoteReply.js";

describe("formatQuote", () => {
  it("prefixes every line, keeping blank lines inside the quote", () => {
    expect(formatQuote("\n  \nfirst line\r\nsecond\n\nthird  \n")).toBe("> first line\n> second\n>\n> third");
  });

  it("returns nothing for empty or non-text selections", () => {
    expect(formatQuote("   \n ")).toBe("");
    expect(formatQuote(null)).toBe("");
  });

  it("cuts very long selections", () => {
    const quote = formatQuote("a".repeat(MAX_QUOTE_LENGTH + 500));
    expect(quote.length).toBe(MAX_QUOTE_LENGTH + 3);
    expect(quote.endsWith("…")).toBe(true);
  });
});

describe("mentions in quoted text", () => {
  it("escapes @paths so a quote never turns into a file mention", async () => {
    const { resolveMentions } = await import("../app/utils/mentions.js");
    const draft = insertQuote("", "See @notes/todo.md and\n@secret.txt, mail a@b.c");
    expect(draft).toBe("> See \\@notes/todo.md and\n> \\@secret.txt, mail a@b.c\n\n");
    const { cleanText, mentions } = resolveMentions(draft, new Set(["notes/todo.md", "secret.txt"]));
    expect(mentions).toEqual([]);
    expect(cleanText).toContain("> See @notes/todo.md and");
  });
});

describe("quoteButtonPosition", () => {
  const area = { top: 52, bottom: 700, left: 250, right: 1250 };

  it("sits above the selection when there is room in the chat area", () => {
    expect(quoteButtonPosition({ top: 300, bottom: 320, left: 400, width: 100 }, area)).toEqual({ top: 260, left: 450 });
  });

  it("goes below a selection that starts just under the toolbar", () => {
    const { top } = quoteButtonPosition({ top: 60, bottom: 80, left: 400, width: 100 }, area);
    expect(top).toBe(88);
  });

  it("never leaves the visible chat area", () => {
    expect(quoteButtonPosition({ top: 20, bottom: 690, left: 0, width: 10 }, area)).toEqual({ top: 660, left: 298 });
    expect(quoteButtonPosition({ top: 10, bottom: 40, left: 2000, width: 10 }, area)).toEqual({ top: 60, left: 1202 });
  });
});

describe("insertQuote", () => {
  it("starts an empty draft with the quote and leaves room for the reply", () => {
    expect(insertQuote("", "hello")).toBe("> hello\n\n");
  });

  it("keeps what was already typed above the new quote", () => {
    expect(insertQuote("> earlier\n\nmy note\n", "second")).toBe("> earlier\n\nmy note\n\n> second\n\n");
  });

  it("leaves the draft alone when nothing is selected", () => {
    expect(insertQuote("draft", "  ")).toBe("draft");
  });
});

describe("quotableSelection", () => {
  function setup() {
    document.body.innerHTML = `
      <div class="message assistant" id="m1"><div class="reasoning-content markdown-content"><p id="r">Thinking</p></div><div class="part-content"><div class="markdown-content"><p id="a">Alpha text</p><p id="b">Beta text</p></div></div><div class="tool-card" id="t">Search result</div><div class="part-content"><div class="markdown-content"><p id="a2">After tool</p></div></div><div class="footer" id="f">Copy</div></div>
      <div class="message user"><div class="bubble"><p id="u">User text</p></div></div>
      <div class="message assistant" id="m2"><div class="part-content"><div class="markdown-content"><p id="c">Gamma</p></div></div></div>`;
  }
  const fake = (anchorId, focusId, text) => ({
    isCollapsed: false,
    rangeCount: 1,
    anchorNode: document.getElementById(anchorId).firstChild,
    focusNode: document.getElementById(focusId).firstChild,
    toString: () => text,
  });

  it("accepts a selection inside one assistant message", () => {
    setup();
    expect(quotableSelection(fake("a", "b", "Alpha text\nBeta"))).toBe("Alpha text\nBeta");
  });

  it("rejects user messages, message chrome and cross-message selections", () => {
    setup();
    expect(quotableSelection(fake("u", "u", "User"))).toBe("");
    expect(quotableSelection(fake("a", "f", "Alpha Copy"))).toBe("");
    expect(quotableSelection(fake("a", "c", "Alpha Gamma"))).toBe("");
  });

  it("rejects reasoning and selections that run across a tool card into the next answer block", () => {
    setup();
    expect(quotableSelection(fake("r", "r", "Thinking"))).toBe("");
    expect(quotableSelection(fake("a", "a2", "Alpha Search result After tool"))).toBe("");
  });

  it("keeps the indentation of the first selected line", () => {
    setup();
    const selected = "    if ready:\n        run()";
    expect(formatQuote(quotableSelection(fake("a", "b", selected)))).toBe(">     if ready:\n>         run()");
  });

  it("rejects collapsed or missing selections", () => {
    setup();
    expect(quotableSelection(null)).toBe("");
    expect(quotableSelection({ ...fake("a", "a", "x"), isCollapsed: true })).toBe("");
  });
});

describe("wiring", () => {
  const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("ChatPanel offers a quote button and emits the selection", () => {
    const source = read("app/components/ChatPanel.vue");
    expect(source).toMatch(/class="quote-selection-button"/);
    expect(source).toMatch(/"quote-message"/);
  });

  it("every chat page passes the quote to the composer", () => {
    for (const page of ["app/pages/[id].vue", "app/pages/incognito.vue", "app/pages/index.vue"]) {
      expect(read(page)).toMatch(/@quote-message="text => messageFormRef\?\.quoteText\(text\)"/);
    }
    expect(read("app/components/MessageForm.vue")).toMatch(/defineExpose\(\{[^}]*quoteText/);
  });
});
