import { describe, it, expect } from "vitest";
import { showTitleWhenClipped } from "~/utils/clippedTitle";

function span(scrollWidth, clientWidth) {
  const element = document.createElement("span");
  Object.defineProperty(element, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(element, "clientWidth", { value: clientWidth, configurable: true });
  return element;
}

describe("showTitleWhenClipped", () => {
  it("adds the full text as a tooltip when it is cut off", () => {
    const element = span(300, 180);
    showTitleWhenClipped(element, "A very long chat title");
    expect(element.title).toBe("A very long chat title");
  });

  it("adds nothing when the text fits", () => {
    const element = span(120, 180);
    showTitleWhenClipped(element, "Short");
    expect(element.hasAttribute("title")).toBe(false);
  });

  it("removes a tooltip left from when the text was cut off", () => {
    const element = span(120, 180);
    element.title = "Old title";
    showTitleWhenClipped(element, "Short");
    expect(element.hasAttribute("title")).toBe(false);
  });

  it("notices text that overflows by less than a pixel", () => {
    const element = span(180, 180);
    element.getBoundingClientRect = () => ({ width: 180 });
    const range = { selectNodeContents() {}, getBoundingClientRect: () => ({ width: 180.4 }) };
    Object.defineProperty(element, "ownerDocument", { value: { createRange: () => range } });
    showTitleWhenClipped(element, "Almost fits");
    expect(element.title).toBe("Almost fits");
  });

  it("ignores a missing element", () => {
    expect(() => showTitleWhenClipped(null, "x")).not.toThrow();
  });
});
