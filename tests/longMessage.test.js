import { describe, it, expect } from "vitest";
import { isLongMessage, COLLAPSED_LINES } from "../app/utils/longMessage.js";

describe("isLongMessage", () => {
  const line = 24;

  it("leaves short messages alone", () => {
    expect(isLongMessage(line, line)).toBe(false);
    expect(isLongMessage(line * COLLAPSED_LINES, line)).toBe(false);
  });

  it("does not collapse a message to hide only a line or two", () => {
    expect(isLongMessage(line * (COLLAPSED_LINES + 2), line)).toBe(false);
  });

  it("collapses once enough lines would be hidden", () => {
    expect(isLongMessage(line * (COLLAPSED_LINES + 4), line)).toBe(true);
    expect(isLongMessage(line * (COLLAPSED_LINES + 4) - 0.4, line)).toBe(true);
    expect(isLongMessage(line * 60, line)).toBe(true);
  });

  it("is false until the text has been measured", () => {
    expect(isLongMessage(0, line)).toBe(false);
    expect(isLongMessage(400, 0)).toBe(false);
    expect(isLongMessage(NaN, NaN)).toBe(false);
  });
});
