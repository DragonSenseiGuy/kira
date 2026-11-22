/**
 * Tests for Mermaid diagrams in the code-block preview
 * (app/utils/codeBlockUtils.js). Mermaid itself needs a real browser to
 * lay a diagram out, so it is replaced here.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const render = vi.fn();
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render } }));

import { isPreviewableLang, togglePreview } from "../app/utils/codeBlockUtils.js";
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
  render.mockReset();
});

describe("Mermaid preview", () => {
  it("offers a preview for mermaid blocks", () => {
    expect(isPreviewableLang("mermaid")).toBe(true);
    expect(renderBlock("graph TD; A-->B").button).toBeDefined();
  });

  it("shows the drawn diagram in the sandboxed frame", async () => {
    render.mockResolvedValue({ svg: '<svg id="drawn"></svg>' });
    const { wrapper, button } = renderBlock("graph TD; A-->B");
    await togglePreview(button);

    expect(render).toHaveBeenCalledWith(expect.any(String), "graph TD; A-->B\n");
    const frame = wrapper.querySelector("iframe.code-preview-frame");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain('<svg id="drawn"></svg>');
    expect(wrapper.querySelector("pre").hidden).toBe(true);
    expect(button.textContent.trim()).toBe("Code");
  });

  it("shows the error, escaped, when the diagram is not valid", async () => {
    render.mockRejectedValue(new Error("Parse error near <b>"));
    const { wrapper, button } = renderBlock("not a diagram");
    await togglePreview(button);

    const page = wrapper.querySelector("iframe").getAttribute("srcdoc");
    expect(page).toContain("This diagram could not be drawn.");
    expect(page).toContain("Parse error near &lt;b>");
  });

  it("stays on the code when toggled back before the diagram is drawn", async () => {
    let finish;
    render.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { wrapper, button } = renderBlock("graph TD; A-->B");
    const pending = togglePreview(button);
    await togglePreview(button);
    finish({ svg: "<svg></svg>" });
    await pending;

    expect(wrapper.querySelector("iframe")).toBeNull();
    expect(wrapper.querySelector("pre").hidden).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("goes back to the code on a second click", async () => {
    render.mockResolvedValue({ svg: "<svg></svg>" });
    const { wrapper, button } = renderBlock("graph TD; A-->B");
    await togglePreview(button);
    await togglePreview(button);
    expect(wrapper.querySelector("iframe")).toBeNull();
    expect(button.textContent.trim()).toBe("Preview");
  });
});
