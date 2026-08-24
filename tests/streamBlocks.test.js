/**
 * Tests for app/utils/streamBlocks.js
 *
 * These helpers power the incremental streaming renderer. The renderer
 * re-splits the full content on every streaming update, so both
 * correctness (fences must not be split) and shape (block boundaries)
 * are pinned down here.
 */

import { describe, it, expect } from "vitest";
import { splitIntoBlocks, addCaretToHtml } from "../app/utils/streamBlocks.js";

describe("splitIntoBlocks", () => {
  it("returns a single empty block for empty input", () => {
    expect(splitIntoBlocks("")).toEqual([""]);
    expect(splitIntoBlocks(null)).toEqual([""]);
  });

  it("keeps a single paragraph as one block", () => {
    expect(splitIntoBlocks("just one line")).toEqual(["just one line"]);
  });

  it("keeps plain paragraphs together across a blank line", () => {
    // Blank lines only split when followed by a block starter
    // (heading, list, quote, fence, table) or the end of content.
    const md = "first paragraph\n\nsecond paragraph";
    expect(splitIntoBlocks(md)).toEqual([md]);
  });

  it("keeps a code fence containing blank lines as ONE block", () => {
    const md = [
      "before",
      "",
      "```js",
      "function a() {",
      "",
      "  return 1;",
      "}",
      "```",
      "",
      "after",
    ].join("\n");

    const blocks = splitIntoBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe("before");
    expect(blocks[1]).toContain("```js");
    expect(blocks[1]).toContain("return 1;");
    expect(blocks[2]).toContain("after");
  });

  it("does not split inside an UNTERMINATED code fence (streaming tail)", () => {
    const md = ["intro", "", "```python", "x = 1", "", "y = 2"].join("\n");
    const blocks = splitIntoBlocks(md);
    expect(blocks).toEqual(["intro", "```python\nx = 1\n\ny = 2"]);
  });

  it("starts a new block when a heading follows a blank line", () => {
    const md = "some text\n\n## Heading";
    expect(splitIntoBlocks(md)).toEqual(["some text", "## Heading"]);
  });

  it("starts a new block when a list follows a blank line", () => {
    const md = "paragraph\n\n- item one\n- item two";
    expect(splitIntoBlocks(md)).toEqual(["paragraph", "- item one\n- item two"]);
  });

  it("starts a new block when an ordered list follows a blank line", () => {
    const md = "paragraph\n\n1. first\n2. second";
    expect(splitIntoBlocks(md)).toEqual(["paragraph", "1. first\n2. second"]);
  });

  it("does NOT split on a blank line followed by plain prose", () => {
    const md = "line one\nline two\n\ncontinuation of same thought";
    expect(splitIntoBlocks(md)).toEqual([md]);
  });

  it("does not treat fence markers inside a fence as boundaries", () => {
    const md = ["```md", "~~~", "inner", "~~~", "```"].join("\n");
    expect(splitIntoBlocks(md)).toEqual([md]);
  });

  it("keeps content joined across multiple consecutive blank lines", () => {
    // No block starter follows the blank lines, so everything stays one block.
    expect(splitIntoBlocks("a\n\n\n\nb")).toEqual(["a\n\n\n\nb"]);
  });
});

describe("addCaretToHtml", () => {
  it("returns just the caret for empty html", () => {
    expect(addCaretToHtml("")).toBe('<span class="streaming-caret"></span>');
    expect(addCaretToHtml("   ")).toBe('<span class="streaming-caret"></span>');
  });

  it("inserts the caret before the last closing tag", () => {
    const html = "<p>hello</p>";
    expect(addCaretToHtml(html)).toBe(
      '<p>hello<span class="streaming-caret"></span></p>',
    );
  });

  it("appends the caret when there is no trailing closing tag", () => {
    const html = "plain text";
    expect(addCaretToHtml(html)).toBe(
      'plain text<span class="streaming-caret"></span>',
    );
  });
});
