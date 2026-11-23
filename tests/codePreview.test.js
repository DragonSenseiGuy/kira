/**
 * Tests for inline previews of HTML/SVG code blocks in chat messages
 * (app/utils/codeBlockUtils.js + the fence renderer in app/utils/markdown.js).
 *
 * Model output is untrusted, so the security contract is pinned here too:
 * the preview runs in an iframe sandboxed WITHOUT same-origin access.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  isPreviewableLang,
  buildPreviewDocument,
  togglePreview,
} from "../app/utils/codeBlockUtils.js";
import { md } from "../app/utils/markdown.js";

function renderBlock(lang, code) {
  const host = document.createElement("div");
  host.innerHTML = md.render("```" + lang + "\n" + code + "\n```");
  document.body.appendChild(host);
  const wrapper = host.querySelector(".code-block-wrapper");
  const button = [...wrapper.querySelectorAll("button")].find((b) => /preview/i.test(b.textContent));
  return { wrapper, button };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("isPreviewableLang", () => {
  it("accepts HTML and SVG in any letter case", () => {
    for (const lang of ["html", "HTML", "htm", "svg", "SVG"]) {
      expect(isPreviewableLang(lang)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const lang of ["js", "javascript", "text", "xml", "css", "", undefined, null]) {
      expect(isPreviewableLang(lang)).toBe(false);
    }
  });
});

describe("buildPreviewDocument", () => {
  it("uses HTML as the document itself", () => {
    const code = "<!doctype html><h1>Hi</h1>";
    expect(buildPreviewDocument("html", code).startsWith(code)).toBe(true);
  });

  it("keeps in-page links inside the preview", () => {
    // A srcdoc frame resolves "#id" against the parent URL; without the
    // helper the link would load the app inside the frame.
    const doc = buildPreviewDocument("html", '<a href="#features">Go</a><h2 id="features">Features</h2>');
    const frame = document.createElement("div");
    frame.innerHTML = doc;
    const script = frame.querySelector("script");
    expect(script).toBeTruthy();
    document.body.appendChild(frame);
    const target = frame.querySelector("#features");
    let scrolled = false;
    target.scrollIntoView = () => {
      scrolled = true;
    };
    new Function(script.textContent)();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    frame.querySelector("a").dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(scrolled).toBe(true);
    frame.remove();
  });

  it("wraps SVG in a minimal HTML page", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
    const doc = buildPreviewDocument("svg", svg);
    expect(doc).toMatch(/^<!doctype html>/i);
    expect(doc).toContain(svg);
  });
});

describe("fence renderer", () => {
  it("adds a Preview button to HTML and SVG blocks", () => {
    expect(renderBlock("html", "<h1>Hi</h1>").button).toBeTruthy();
    expect(renderBlock("svg", "<svg></svg>").button).toBeTruthy();
  });

  it("does not add one to other languages", () => {
    expect(renderBlock("js", "console.log(1)").button).toBeUndefined();
    expect(renderBlock("", "plain").button).toBeUndefined();
  });

  it("keeps the Download and Copy buttons", () => {
    const { wrapper } = renderBlock("html", "<h1>Hi</h1>");
    const labels = [...wrapper.querySelectorAll("button")].map((b) => b.textContent.trim());
    expect(labels).toContain("Download");
    expect(labels).toContain("Copy");
  });
});

describe("togglePreview", () => {
  const code = '<h1 class="x">Hi & bye</h1>\n<script>document.title = "t"</script>';

  it("shows the code in a sandboxed iframe and hides the source", () => {
    const { wrapper, button } = renderBlock("html", code);
    togglePreview(button);

    const frame = wrapper.querySelector("iframe");
    expect(frame).toBeTruthy();
    expect(frame.getAttribute("srcdoc").startsWith(code)).toBe(true);
    expect(wrapper.querySelector("pre").hidden).toBe(true);
    expect(button.textContent.trim()).toBe("Code");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("never grants the preview same-origin, top-navigation or popup access", () => {
    const { wrapper, button } = renderBlock("html", code);
    togglePreview(button);

    const sandbox = wrapper.querySelector("iframe").getAttribute("sandbox");
    expect(sandbox).not.toBeNull();
    expect(sandbox).not.toMatch(/allow-same-origin/);
    expect(sandbox).not.toMatch(/allow-top-navigation/);
    expect(sandbox).not.toMatch(/allow-popups/);
    expect(wrapper.querySelector("iframe").getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("returns to the source on the second click", () => {
    const { wrapper, button } = renderBlock("html", code);
    togglePreview(button);
    togglePreview(button);

    expect(wrapper.querySelector("iframe")).toBeNull();
    expect(wrapper.querySelector("pre").hidden).toBe(false);
    expect(button.textContent.trim()).toBe("Preview");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("previews SVG through the wrapping page", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
    const { wrapper, button } = renderBlock("svg", svg);
    togglePreview(button);
    expect(wrapper.querySelector("iframe").getAttribute("srcdoc")).toBe(buildPreviewDocument("svg", svg + "\n"));
  });

  it("ignores buttons that are not inside a code block", () => {
    const stray = document.createElement("button");
    document.body.appendChild(stray);
    expect(() => togglePreview(stray)).not.toThrow();
    expect(() => togglePreview(null)).not.toThrow();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
