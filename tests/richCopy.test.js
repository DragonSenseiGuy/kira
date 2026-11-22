import { describe, it, expect, vi } from "vitest";
import { clipboardHtml, copyRichText } from "~/utils/richCopy";

function block(html) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

describe("clipboardHtml", () => {
  it("keeps formatting and drops the page's controls", () => {
    const html = clipboardHtml([
      block(
        '<h2>Title</h2><div class="code-block-wrapper"><div class="code-block-header"><span>js</span><button>Copy</button></div><pre><code>let a = 1;</code></pre></div>',
      ),
    ]);
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<pre><code>let a = 1;</code></pre>");
    expect(html).not.toContain("button");
    expect(html).not.toContain("code-block-header");
  });

  it("replaces rendered math with its TeX source", () => {
    const html = clipboardHtml([
      block(
        '<p>Area: <span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">\\pi r^2</annotation></semantics></math></span><span class="katex-html">πr2</span></span></p>',
      ),
    ]);
    expect(html).toBe("<p>Area: \\pi r^2</p>");
  });

  it("joins the blocks of one reply and leaves the page untouched", () => {
    const first = block("<p>one</p><button>x</button>");
    const html = clipboardHtml([first, block(""), block("<p>two</p>")]);
    expect(html).toBe("<p>one</p>\n<p>two</p>");
    expect(first.querySelector("button")).not.toBeNull();
  });
});

describe("copyRichText", () => {
  class Item {
    constructor(data) {
      this.data = data;
    }
  }

  it("writes plain text and HTML together", async () => {
    const clipboard = { write: vi.fn(async () => {}), writeText: vi.fn(async () => {}) };
    await copyRichText("**hi**", "<strong>hi</strong>", clipboard, Item);
    const [item] = clipboard.write.mock.calls[0][0];
    expect(Object.keys(item.data)).toEqual(["text/plain", "text/html"]);
    expect(item.data["text/html"].type).toBe("text/html");
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to plain text when there is no HTML or no support", async () => {
    const clipboard = { write: vi.fn(async () => {}), writeText: vi.fn(async () => {}) };
    await copyRichText("hi", "", clipboard, Item);
    await copyRichText("hi", "<p>hi</p>", clipboard, null);
    expect(clipboard.write).not.toHaveBeenCalled();
    expect(clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  it("falls back to plain text when the browser refuses HTML", async () => {
    const clipboard = {
      write: vi.fn(async () => { throw new Error("NotAllowedError"); }),
      writeText: vi.fn(async () => {}),
    };
    await copyRichText("hi", "<p>hi</p>", clipboard, Item);
    expect(clipboard.writeText).toHaveBeenCalledWith("hi");
  });
});
