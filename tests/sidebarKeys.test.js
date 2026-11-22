import { describe, it, expect } from "vitest";
import { sidebarArrowTarget } from "~/utils/sidebarKeys";

const search = { name: "search" };
const chats = [{ name: "a" }, { name: "b" }, { name: "c" }];

describe("sidebarArrowTarget", () => {
  it("moves from the search field into the list", () => {
    expect(sidebarArrowTarget("ArrowDown", search, search, chats)).toBe(chats[0]);
    expect(sidebarArrowTarget("ArrowUp", search, search, chats)).toBeNull();
    expect(sidebarArrowTarget("ArrowDown", search, search, [])).toBeNull();
  });

  it("moves between chats and stops at the last one", () => {
    expect(sidebarArrowTarget("ArrowDown", chats[0], search, chats)).toBe(chats[1]);
    expect(sidebarArrowTarget("ArrowUp", chats[2], search, chats)).toBe(chats[1]);
    expect(sidebarArrowTarget("ArrowDown", chats[2], search, chats)).toBeNull();
  });

  it("returns to the search field from the first chat", () => {
    expect(sidebarArrowTarget("ArrowUp", chats[0], search, chats)).toBe(search);
  });

  it("ignores other keys and elements outside the list", () => {
    expect(sidebarArrowTarget("Enter", chats[0], search, chats)).toBeNull();
    expect(sidebarArrowTarget("ArrowDown", { name: "menu" }, search, chats)).toBeNull();
  });
});
