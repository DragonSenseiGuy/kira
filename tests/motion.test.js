import { describe, it, expect } from "vitest";
import { motionSafeScroll } from "~/utils/motion";

const reduced = (matches) => (query) => ({ matches: query.includes("reduce") && matches });

describe("motionSafeScroll", () => {
  it("keeps smooth scrolling when motion is allowed", () => {
    expect(motionSafeScroll("smooth", reduced(false))).toBe("smooth");
  });

  it("jumps instead when reduced motion is requested", () => {
    expect(motionSafeScroll("smooth", reduced(true))).toBe("auto");
  });

  it("leaves other behaviours alone", () => {
    expect(motionSafeScroll("instant", reduced(true))).toBe("instant");
    expect(motionSafeScroll("auto", reduced(true))).toBe("auto");
  });

  it("falls back to the requested behaviour without matchMedia", () => {
    expect(motionSafeScroll("smooth", null)).toBe("smooth");
    expect(motionSafeScroll("smooth", () => { throw new Error("unsupported"); })).toBe("smooth");
  });
});
