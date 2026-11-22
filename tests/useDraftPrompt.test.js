import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";

const store = new Map();
vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => store.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { store.set(key, value); }),
    removeItem: vi.fn(async (key) => { store.delete(key); }),
  },
}));
vi.mock("../app/composables/useGlobalIncognito", () => ({
  useGlobalIncognito: () => ({ isIncognito: { value: false } }),
}));

import { useDraftPrompt } from "../app/composables/useDraftPrompt.js";

const settle = async () => {
  await nextTick();
  await vi.advanceTimersByTimeAsync(400);
};

beforeEach(() => {
  store.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame"] });
});
afterEach(() => vi.useRealTimers());

describe("useDraftPrompt", () => {
  it("saves and restores a normal draft", async () => {
    const input = ref("");
    useDraftPrompt(ref("c1"), input, { isEphemeral: ref(false) });
    await settle();
    input.value = "unsent";
    await settle();
    expect(store.get("draft:c1")).toBe("unsent");

    const restored = ref("");
    useDraftPrompt(ref("c1"), restored, { isEphemeral: ref(false) });
    await settle();
    expect(restored.value).toBe("unsent");
  });

  it("stores nothing typed in incognito and does not restore a stored draft there", async () => {
    store.set("draft:new", "from a normal chat");
    const input = ref("");
    useDraftPrompt(ref(""), input, { isEphemeral: ref(true) });
    await settle();
    expect(input.value).toBe("");

    input.value = "private thought";
    await settle();
    expect(store.get("draft:new")).toBe("from a normal chat");
    expect([...store.values()]).not.toContain("private thought");
  });

  it("drops a pending save when incognito is switched on", async () => {
    const input = ref("");
    const ephemeral = ref(false);
    useDraftPrompt(ref(""), input, { isEphemeral: ephemeral });
    await settle();
    input.value = "typed just before";
    await nextTick();
    ephemeral.value = true;
    await settle();
    expect(store.has("draft:new")).toBe(false);
    expect(input.value).toBe("typed just before");
  });

  it("keeps the stored normal draft when an incognito message is sent", async () => {
    store.set("draft:new", "Plan the roadmap");
    const input = ref("");
    const { clearDraft } = useDraftPrompt(ref(""), input, { isEphemeral: ref(true) });
    await settle();
    input.value = "Private question";
    await settle();
    input.value = "";
    await clearDraft();
    await settle();
    expect(store.get("draft:new")).toBe("Plan the roadmap");
  });

  it("clears the stored draft when a normal message is sent", async () => {
    store.set("draft:new", "Plan the roadmap");
    const input = ref("");
    const { clearDraft } = useDraftPrompt(ref(""), input, { isEphemeral: ref(false) });
    await settle();
    await clearDraft();
    expect(store.has("draft:new")).toBe(false);
  });

  it("restores the stored draft when incognito is switched off with an empty composer", async () => {
    store.set("draft:new", "Plan the roadmap");
    const input = ref("");
    const ephemeral = ref(true);
    useDraftPrompt(ref(""), input, { isEphemeral: ephemeral });
    await settle();
    expect(input.value).toBe("");
    ephemeral.value = false;
    await settle();
    expect(input.value).toBe("Plan the roadmap");
    input.value = "Plan the roadmap and budget";
    await settle();
    expect(store.get("draft:new")).toBe("Plan the roadmap and budget");
  });

  it("does not replace text in the composer when incognito is switched off", async () => {
    store.set("draft:new", "Plan the roadmap");
    const input = ref("");
    const ephemeral = ref(true);
    useDraftPrompt(ref(""), input, { isEphemeral: ephemeral });
    await settle();
    input.value = "typed while private";
    await settle();
    ephemeral.value = false;
    await settle();
    expect(input.value).toBe("typed while private");
  });

  it("uses the incognito state by default", async () => {
    const input = ref("");
    useDraftPrompt(ref("c2"), input);
    await settle();
    input.value = "kept";
    await settle();
    expect(store.get("draft:c2")).toBe("kept");
  });
});
