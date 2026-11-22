import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatQuote, insertQuote, quotableSelection, MAX_QUOTE_LENGTH } from "../app/utils/quoteReply.js";

describe("formatQuote", () => {
  it("prefixes every line, keeping blank lines inside the quote", () => {
    expect(formatQuote("  first line\r\nsecond\n\nthird  ")).toBe("> first line\n> second\n>\n> third");
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
      <div class="message assistant" id="m1"><div class="markdown-content"><p id="a">Alpha text</p><p id="b">Beta text</p></div><div class="footer" id="f">Copy</div></div>
      <div class="message user"><div class="bubble"><p id="u">User text</p></div></div>
      <div class="message assistant" id="m2"><div class="markdown-content"><p id="c">Gamma</p></div></div>`;
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
    expect(quotableSelection(fake("a", "b", " Alpha text\nBeta "))).toBe("Alpha text\nBeta");
  });

  it("rejects user messages, message chrome and cross-message selections", () => {
    setup();
    expect(quotableSelection(fake("u", "u", "User"))).toBe("");
    expect(quotableSelection(fake("a", "f", "Alpha Copy"))).toBe("");
    expect(quotableSelection(fake("a", "c", "Alpha Gamma"))).toBe("");
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
