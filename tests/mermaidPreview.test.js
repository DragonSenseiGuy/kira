/**
 * Tests for Mermaid diagrams in the code-block preview
 * (app/utils/codeBlockUtils.js). The diagram source is model output, so
 * Mermaid must run inside the sandboxed frame, not in the app page.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { isPreviewableLang, buildMermaidDocument, togglePreview } from "../app/utils/codeBlockUtils.js";
import { md } from "../app/utils/markdown.js";

function renderBlock(code) {
  const host = document.createElement("div");
  host.innerHTML = md.render("```mermaid\n" + code + "\n```");
  document.body.appendChild(host);
  const wrapper = host.querySelector(".code-block-wrapper");
  const button = [...wrapper.querySelectorAll("button")].find((b) => b.textContent.trim() === "Preview");
  return { wrapper, button };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("buildMermaidDocument", () => {
  it("loads the renderer by URL and embeds the source as a string", () => {
    const page = buildMermaidDocument("graph TD; A-->B", "https://kira.test/_nuxt/mermaid.min.js");
    expect(page).toContain('<script src="https://kira.test/_nuxt/mermaid.min.js"');
    expect(page).toContain('mermaid.render("diagram-svg","graph TD; A-->B")');
    expect(page).toContain('securityLevel:"strict"');
  });

  it("cannot be closed early by the source", () => {
    const page = buildMermaidDocument('graph TD; A["</script><script>alert(1)</script>"]', "/m.js");
    expect(page).not.toContain("<script>alert(1)");
    expect(page.match(/<\/script>/g)).toHaveLength(2);
    expect(page).toContain("\\u003c/script>");
  });

  it("escapes the script URL", () => {
    expect(buildMermaidDocument("x", '/m.js?a=1&b="2"')).toContain('src="/m.js?a=1&amp;b=&quot;2&quot;"');
  });
});

describe("Mermaid preview", () => {
  it("offers a preview for mermaid blocks", () => {
    expect(isPreviewableLang("mermaid")).toBe(true);
    expect(renderBlock("graph TD; A-->B").button).toBeDefined();
  });

  it("draws the diagram inside the sandboxed frame, not in the page", () => {
    const { wrapper, button } = renderBlock("graph TD; A-->B");
    togglePreview(button);

    const frame = wrapper.querySelector("iframe.code-preview-frame");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain('mermaid.render("diagram-svg","graph TD; A-->B\\n")');
    expect(document.querySelector("#diagram-svg, #ddiagram-svg")).toBeNull();
    expect(wrapper.querySelector("pre").hidden).toBe(true);
    expect(button.textContent.trim()).toBe("Code");
  });

  it("goes back to the code on a second click", () => {
    const { wrapper, button } = renderBlock("graph TD; A-->B");
    togglePreview(button);
    togglePreview(button);
    expect(wrapper.querySelector("iframe")).toBeNull();
    expect(button.textContent.trim()).toBe("Preview");
  });
});
