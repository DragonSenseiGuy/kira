import { describe, it, expect } from "vitest";
import { adjacentChatId } from "~/utils/chatNavigation";

const groups = [
  { key: "pinned", conversations: [{ id: "p1" }] },
  { key: "today", conversations: [{ id: "a" }, { id: "b" }] },
  { key: "older", conversations: [{ id: "c" }] },
];

describe("adjacentChatId", () => {
  it("steps through chats in sidebar order, across groups", () => {
    expect(adjacentChatId(groups, "p1", 1)).toBe("a");
    expect(adjacentChatId(groups, "b", 1)).toBe("c");
    expect(adjacentChatId(groups, "c", -1)).toBe("b");
    expect(adjacentChatId(groups, "a", -1)).toBe("p1");
  });

  it("stops at either end", () => {
    expect(adjacentChatId(groups, "p1", -1)).toBeNull();
    expect(adjacentChatId(groups, "c", 1)).toBeNull();
  });

  it("starts from the first chat when none is open", () => {
    expect(adjacentChatId(groups, undefined, 1)).toBe("p1");
    expect(adjacentChatId(groups, undefined, -1)).toBeNull();
    expect(adjacentChatId([], undefined, 1)).toBeNull();
  });

  it("skips pinned chats while that group is collapsed", () => {
    expect(adjacentChatId(groups, "a", -1, false)).toBeNull();
    expect(adjacentChatId(groups, undefined, 1, false)).toBe("a");
  });
});
