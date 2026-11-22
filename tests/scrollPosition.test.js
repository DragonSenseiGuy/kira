import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { distanceFromBottom, isAtBottom, shouldOfferJump } from "../app/utils/scrollPosition.js";

const box = (scrollTop) => ({ scrollHeight: 2000, clientHeight: 600, scrollTop });

describe("scroll position", () => {
  it("measures the distance to the end", () => {
    expect(distanceFromBottom(box(1400))).toBe(0);
    expect(distanceFromBottom(box(1000))).toBe(400);
    expect(distanceFromBottom(null)).toBe(0);
  });

  it("treats a few pixels of slack as the bottom", () => {
    expect(isAtBottom(box(1395))).toBe(true);
    expect(isAtBottom(box(1300))).toBe(false);
  });

  it("offers the jump button only when well away from the end", () => {
    expect(shouldOfferJump(box(1400))).toBe(false);
    expect(shouldOfferJump(box(1300))).toBe(false);
    expect(shouldOfferJump(box(1000))).toBe(true);
    expect(shouldOfferJump({ scrollHeight: 500, clientHeight: 600, scrollTop: 0 })).toBe(false);
  });
});

describe("ChatPanel jump-to-latest button", () => {
  const source = readFileSync(resolve(process.cwd(), "app/components/ChatPanel.vue"), "utf8");

  it("renders an accessible button wired to scrollToEnd", () => {
    expect(source).toMatch(/class="jump-to-latest"/);
    expect(source).toMatch(/aria-label="Jump to latest message"/);
    expect(source).toMatch(/v-if="showJumpToLatest"/);
    expect(source).toMatch(/@click="scrollToEnd\('smooth'\)"/);
  });
});
