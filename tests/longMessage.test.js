import { describe, it, expect } from "vitest";
import { estimateLines, isLongMessage, COLLAPSED_LINES } from "../app/utils/longMessage.js";

describe("estimateLines", () => {
  it("counts line breaks and wrapped lines", () => {
    expect(estimateLines("one")).toBe(1);
    expect(estimateLines("a\nb\nc")).toBe(3);
    expect(estimateLines("a\n\nb")).toBe(3);
    expect(estimateLines("x".repeat(141))).toBe(3);
  });

  it("treats missing text as empty", () => {
    expect(estimateLines("")).toBe(0);
    expect(estimateLines(undefined)).toBe(0);
    expect(estimateLines(null)).toBe(0);
  });
});

describe("isLongMessage", () => {
  it("leaves short messages alone", () => {
    expect(isLongMessage("hello")).toBe(false);
    expect(isLongMessage(Array(COLLAPSED_LINES).fill("line").join("\n"))).toBe(false);
  });

  it("does not collapse a message to hide only a line or two", () => {
    expect(isLongMessage(Array(COLLAPSED_LINES + 2).fill("line").join("\n"))).toBe(false);
  });

  it("collapses many lines or one long pasted paragraph", () => {
    expect(isLongMessage(Array(COLLAPSED_LINES + 4).fill("line").join("\n"))).toBe(true);
    expect(isLongMessage("word ".repeat(400))).toBe(true);
  });
});
