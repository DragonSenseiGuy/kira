import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map();
vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => store.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { store.set(key, value); return value; }),
  },
}));
vi.mock("../app/composables/storeConversations", () => ({ deleteConversation: vi.fn() }));

import { groupConversations, useConversationsList } from "../app/composables/useConversationsList.js";

const now = new Date().toISOString();
const conv = (id, extra = {}) => ({ id, title: id, createdAt: now, lastUpdated: now, ...extra });

describe("groupConversations", () => {
  it("puts archived conversations in a last group, even when pinned", () => {
    const groups = groupConversations([conv("a"), conv("b", { archived: true }), conv("c", { pinned: true }), conv("d", { archived: true, pinned: true })]);
    expect(groups.map((g) => g.key)).toEqual(["pinned", "today", "archived"]);
    expect(groups[2].label).toBe("Archived");
    expect(groups[2].conversations.map((c) => c.id).sort()).toEqual(["b", "d"]);
    expect(groups[0].conversations.map((c) => c.id)).toEqual(["c"]);
  });

  it("has no archived group when nothing is archived", () => {
    expect(groupConversations([conv("a")]).map((g) => g.key)).toEqual(["today"]);
  });
});

describe("toggleArchive", () => {
  beforeEach(() => {
    store.clear();
    store.set("conversations_metadata", [conv("a", { pinned: true }), conv("b")]);
  });

  it("archives, unpins and persists; then restores", async () => {
    const list = useConversationsList();
    await list.updateConversations();

    await list.toggleArchive("a");
    expect(store.get("conversations_metadata")[0]).toMatchObject({ id: "a", archived: true, pinned: false });
    expect(store.get("conversations_metadata")[1].archived).toBeFalsy();
    expect(list.groupedConversations.value.map((g) => g.key)).toEqual(["today", "archived"]);

    await list.toggleArchive("a");
    expect(store.get("conversations_metadata")[0]).toMatchObject({ id: "a", archived: false });
    expect(list.groupedConversations.value.map((g) => g.key)).toEqual(["today"]);
  });

  it("still finds archived conversations by search", async () => {
    const list = useConversationsList();
    await list.updateConversations();
    await list.toggleArchive("b");
    list.searchQuery.value = "b";
    expect(list.groupedConversations.value).toHaveLength(1);
    expect(list.groupedConversations.value[0].key).toBe("archived");
  });
});
