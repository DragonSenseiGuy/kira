import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map();
vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => structuredClone(store.get(key) ?? null)),
    setItem: vi.fn(async (key, value) => { store.set(key, structuredClone(value)); return value; }),
    removeItem: vi.fn(async (key) => { store.delete(key); }),
  },
}));
vi.mock("~/composables/useAuth", () => ({
  useAuth: () => ({ accountsEnabled: { value: true }, user: { value: { id: "u1" } } }),
}));

import { mergeMetadataEntries } from "../app/utils/conversationMetadata.js";
import { storeMessages } from "../app/composables/storeConversations.js";
import { useCloudSync } from "../app/composables/useCloudSync.js";

const json = (body) => ({ ok: true, json: async () => body });

beforeEach(() => {
  store.clear();
});

describe("mergeMetadataEntries", () => {
  it("updates known entries in place, keeps their other fields and appends new ones", () => {
    const before = [{ id: "a", title: "A", archived: true }, { id: "b", title: "B" }];
    const after = mergeMetadataEntries(before, [{ id: "a", title: "A2" }, { id: "c", title: "C" }]);
    expect(after).toEqual([
      { id: "a", title: "A2", archived: true },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ]);
    expect(before[0].title).toBe("A");
  });
});

describe("storeMessages", () => {
  it("keeps a conversation archived (and its createdAt) when a new turn is saved", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({})));
    store.set("conversation_a", { title: "Trip", lastUpdated: "2026-01-01T00:00:00Z", messages: [], branchPath: [] });
    store.set("conversations_metadata", [
      { id: "a", title: "Trip", lastUpdated: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", archived: true },
      { id: "b", title: "Other", pinned: true },
    ]);

    await storeMessages("a", [{ id: "m1", role: "user", content: "hi" }], "2026-02-02T00:00:00Z");

    const metadata = store.get("conversations_metadata");
    expect(metadata.find((m) => m.id === "a")).toEqual({
      id: "a", title: "Trip", lastUpdated: "2026-02-02T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", archived: true,
    });
    expect(metadata.find((m) => m.id === "b").pinned).toBe(true);
  });
});

describe("hydrateFromCloud", () => {
  it("does not undo an archive made while a newer chat is downloading", async () => {
    store.set("conversations_metadata", [{ id: "book", title: "Book notes", lastUpdated: "2026-01-01T00:00:00Z" }]);
    store.set("conversation_book", { title: "Book notes", messages: [] });

    vi.stubGlobal("fetch", vi.fn(async (path, options) => {
      if (options?.method && options.method !== "GET") return json({});
      if (path === "/api/conversations") {
        return json({ conversations: [
          { id: "book", lastUpdated: "2026-01-01T00:00:00Z" },
          { id: "trip", lastUpdated: "2026-03-03T00:00:00Z" },
        ] });
      }
      // The user archives "Book notes" while "Trip planning" downloads.
      const current = store.get("conversations_metadata");
      store.set("conversations_metadata", current.map((m) => (m.id === "book" ? { ...m, archived: true } : m)));
      return json({ id: "trip", title: "Trip planning", lastUpdated: "2026-03-03T00:00:00Z", createdAt: "2026-03-03T00:00:00Z", messages: [] });
    }));

    await useCloudSync().hydrateFromCloud();

    const metadata = store.get("conversations_metadata");
    expect(metadata.find((m) => m.id === "book").archived).toBe(true);
    expect(metadata.find((m) => m.id === "trip").title).toBe("Trip planning");
  });
});

describe("hydrateFromCloud uploads", () => {
  it("does not re-upload a chat created while hydration was downloading", async () => {
    store.set("conversations_metadata", [{ id: "old", title: "Old local", lastUpdated: "2026-01-01T00:00:00Z" }]);
    store.set("conversation_old", { title: "Old local", messages: [] });
    const posted = [];

    vi.stubGlobal("fetch", vi.fn(async (path, options) => {
      if (options?.method === "POST") {
        posted.push(JSON.parse(options.body).id);
        return json({});
      }
      if (path === "/api/conversations") return json({ conversations: [{ id: "trip", lastUpdated: "2026-03-03T00:00:00Z" }] });
      // A new chat is started (and synced normally) during the download.
      store.set("conversations_metadata", [...store.get("conversations_metadata"), { id: "fresh", title: "Fresh", lastUpdated: "2026-03-04T00:00:00Z" }]);
      store.set("conversation_fresh", { title: "Fresh", messages: [] });
      return json({ id: "trip", title: "Trip planning", lastUpdated: "2026-03-03T00:00:00Z", messages: [] });
    }));

    await useCloudSync().hydrateFromCloud();

    expect(posted).toEqual(["old"]);
    expect(store.get("conversations_metadata").map((m) => m.id).sort()).toEqual(["fresh", "old", "trip"]);
  });
});

describe("sidebar", () => {
  it("offers no collapse toggle for Archived while a search forces it open", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "app/components/AppSidebar.vue"), "utf8");
    expect(source).toContain(`COLLAPSIBLE_GROUPS.includes(group.key) && !(group.key === 'archived' && isSearching)`);
  });
});
