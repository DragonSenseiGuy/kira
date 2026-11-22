import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map();
vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => (store.has(key) ? structuredClone(store.get(key)) : null)),
    setItem: vi.fn(async (key, value) => void store.set(key, structuredClone(value))),
    removeItem: vi.fn(async (key) => void store.delete(key)),
  },
}));
const cloudCreateConversation = vi.fn();
vi.mock("../app/composables/useCloudSync", () => ({
  useCloudSync: () => ({ cloudCreateConversation, cloudDeleteConversation: vi.fn(), syncConversation: vi.fn() }),
}));

import { copyTitle, duplicateConversation } from "../app/composables/storeConversations.js";
import { emitter } from "../app/composables/emitter.js";

const messages = [
  { id: "u", parentId: null, branchIndex: 0, role: "user", content: "Q", complete: true },
  { id: "a0", parentId: "u", branchIndex: 0, role: "assistant", content: "old", complete: true, parts: [{ type: "content", content: "old" }] },
  { id: "a1", parentId: "u", branchIndex: 1, role: "assistant", content: "new", complete: true, parts: [{ type: "content", content: "new" }] },
];

beforeEach(() => {
  store.clear();
  cloudCreateConversation.mockClear();
  store.set("conversation_c1", { title: "Trip", lastUpdated: new Date(0), messages, branchPath: [1] });
  store.set("conversations_metadata", [{ id: "c1", title: "Trip", lastUpdated: new Date(0), pinned: true }]);
});

describe("copyTitle", () => {
  it("prefixes the title and numbers repeated copies", () => {
    expect(copyTitle("Trip", ["Trip"])).toBe("Copy of Trip");
    expect(copyTitle("Trip", ["Trip", "Copy of Trip"])).toBe("Copy of Trip (2)");
    expect(copyTitle("Trip", ["Copy of Trip", "Copy of Trip (2)"])).toBe("Copy of Trip (3)");
    expect(copyTitle("  ", [])).toBe("Copy of Untitled");
  });
});

describe("duplicateConversation", () => {
  it("copies every branch under new message ids and keeps the shown branch", async () => {
    const copyId = await duplicateConversation("c1");
    const copy = store.get(`conversation_${copyId}`);

    expect(copyId).not.toBe("c1");
    expect(copy.title).toBe("Copy of Trip");
    expect(copy.branchPath).toEqual([1]);
    expect(copy.messages.map((msg) => msg.content)).toEqual(["Q", "old", "new"]);
    expect(copy.messages.map((msg) => msg.parts)).toEqual(messages.map((msg) => msg.parts));

    const ids = copy.messages.map((msg) => msg.id);
    expect(new Set([...ids, "u", "a0", "a1"]).size).toBe(6);
    expect(copy.messages.map((msg) => msg.parentId)).toEqual([null, ids[0], ids[0]]);
  });

  it("leaves the original untouched and lists the copy unpinned", async () => {
    const copyId = await duplicateConversation("c1");
    expect(store.get("conversation_c1").messages).toEqual(messages);
    const metadata = store.get("conversations_metadata");
    expect(metadata).toHaveLength(2);
    expect(metadata[0]).toMatchObject({ id: "c1", pinned: true });
    expect(metadata[1]).toMatchObject({ id: copyId, title: "Copy of Trip" });
    expect(metadata[1].pinned).toBeUndefined();
  });

  it("refreshes the sidebar and mirrors the copy to the account", async () => {
    const refreshed = vi.fn();
    emitter.on("updateConversations", refreshed);
    const copyId = await duplicateConversation("c1");
    emitter.off("updateConversations", refreshed);
    expect(refreshed).toHaveBeenCalled();
    expect(cloudCreateConversation).toHaveBeenCalledWith(copyId, expect.objectContaining({ title: "Copy of Trip", branchPath: [1] }));
  });

  it("names the copy after a title changed from the sidebar", async () => {
    store.get("conversations_metadata")[0].title = "Renamed";
    const copyId = await duplicateConversation("c1");
    expect(store.get(`conversation_${copyId}`).title).toBe("Copy of Renamed");
    expect(store.get("conversations_metadata")[1].title).toBe("Copy of Renamed");
  });

  it("numbers a second copy", async () => {
    await duplicateConversation("c1");
    const second = await duplicateConversation("c1");
    expect(store.get(`conversation_${second}`).title).toBe("Copy of Trip (2)");
  });

  it("returns null when the conversation no longer exists", async () => {
    expect(await duplicateConversation("gone")).toBeNull();
    expect(store.get("conversations_metadata")).toHaveLength(1);
  });
});
