/**
 * Tests for app/utils/markdown.js
 */

import { describe, it, expect } from "vitest";
import { createMarkdownInstance, md } from "../app/utils/markdown.js";

describe("createMarkdownInstance", () => {
  it("returns a working markdown-it instance", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("# Hello");
    expect(html).toContain("<h1>");
    expect(html).toContain("Hello");
  });

  it("renders paragraphs and emphasis", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("Hello *world* and **everyone**.");
    expect(html).toContain("<em>world</em>");
    expect(html).toContain("<strong>everyone</strong>");
  });

  it("autolinks URLs (linkify enabled)", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("Visit https://example.com today.");
    expect(html).toContain('href="https://example.com"');
  });

  it("renders unordered lists", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("- a\n- b\n- c");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>c</li>");
  });

  it("renders code blocks with the project's custom wrapper", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("```js\nconst x = 1;\n```");
    expect(html).toContain("code-block-wrapper");
    expect(html).toContain("data-needs-highlight");
    expect(html).toContain("code-action-button");
  });

  it("escapes HTML in code blocks (XSS protection)", () => {
    const instance = createMarkdownInstance();
    // A <script> tag inside a fenced code block must NOT survive as live HTML
    const html = instance.render("```\n<script>alert(1)</script>\n```");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("honors disabling KaTeX", () => {
    const instance = createMarkdownInstance({ enableKatex: false });
    const html = instance.render("Inline $x=1$ math");
    expect(html).not.toMatch(/class="katex"/);
  });

  it("honors disabling footnotes", () => {
    const instance = createMarkdownInstance({ enableFootnotes: false });
    expect(() => instance.render("text[^1]\n\n[^1]: note")).not.toThrow();
  });
});

describe("link targets", () => {
  it("opens markdown links in a new tab", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("[example](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("opens autolinked URLs in a new tab", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("Visit https://example.com today.");
    expect(html).toContain('target="_blank"');
  });

  it("leaves in-page anchors alone", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("[section](#section)");
    expect(html).toContain('href="#section"');
    expect(html).not.toContain('target="_blank"');
  });

  it("leaves relative in-app links to the router", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("[docs](/settings)");
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain('target="_blank"');
  });

  it("leaves mailto links alone", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("[mail](mailto:hi@example.com)");
    expect(html).toContain("mailto:hi@example.com");
    expect(html).not.toContain('target="_blank"');
  });

  it("keeps footnote references in-page", () => {
    const instance = createMarkdownInstance();
    const html = instance.render("text[^1]\n\n[^1]: note");
    expect(html).not.toContain('target="_blank"');
  });

  it("applies to the shared singleton", () => {
    const html = md.render("[example](https://example.com)");
    expect(html).toContain('target="_blank"');
  });
});

describe("default md singleton", () => {
  it("is a usable markdown-it instance", () => {
    expect(md).toBeDefined();
    expect(typeof md.render).toBe("function");
    const html = md.render("# title");
    expect(html).toContain("<h1>title</h1>");
  });

  describe("code block language label", () => {
    const render = (lang) => {
      const host = document.createElement("div");
      host.innerHTML = md.render("```" + lang + "\ncode\n```");
      return host;
    };

    it("shows markup in the language as text, not as elements", () => {
      const host = render("<img/src=x/onerror=alert(1)>");
      expect(host.querySelector("img")).toBeNull();
      expect(host.querySelector(".code-language").textContent).toBe(
        "<img/src=x/onerror=alert(1)>",
      );
    });

    it("cannot add attributes or script to the download button", () => {
      for (const lang of ['x"/onmouseover="alert(1)', "x');alert(1);//"]) {
        const host = render(lang);
        const buttons = [...host.querySelectorAll(".code-action-button")];
        expect(buttons).toHaveLength(2);
        expect(buttons.map((b) => b.getAttributeNames().sort())).toEqual([
          ["class", "onclick", "title"],
          ["class", "onclick", "title"],
        ]);
        expect(buttons[0].getAttribute("onclick")).toBe(
          "window.downloadCode(event.currentTarget)",
        );
        expect(host.querySelector(".code-block-wrapper").dataset.lang).toBe(lang);
      }
    });
  });
});
