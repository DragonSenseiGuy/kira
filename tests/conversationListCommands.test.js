// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const store = new Map();
vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => store.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { store.set(key, value); }),
    removeItem: vi.fn(async (key) => { store.delete(key); }),
  },
}));

import { emitter } from "~/composables/emitter";
import { useConversationsList } from "~/composables/useConversationsList";

async function mountList() {
  let list;
  const wrapper = mount(defineComponent({
    setup() {
      list = useConversationsList();
      return () => h("div");
    },
  }));
  await flushPromises();
  return { list, wrapper };
}

describe("conversation list commands from outside the sidebar", () => {
  beforeEach(() => {
    store.clear();
    store.set("conversations_metadata", [
      { id: "a", title: "First chat", pinned: false },
      { id: "b", title: "Second chat", pinned: false },
    ]);
  });

  it("starts renaming a chat by id with its current title", async () => {
    const { list, wrapper } = await mountList();
    emitter.emit("renameConversation", "b");
    expect(list.renamingId.value).toBe("b");
    expect(list.newTitle.value).toBe("Second chat");
    wrapper.unmount();
  });

  it("ignores a rename for a chat that is not in the list", async () => {
    const { list, wrapper } = await mountList();
    emitter.emit("renameConversation", "missing");
    expect(list.renamingId.value).toBeNull();
    wrapper.unmount();
  });

  it("pins and unpins a chat by id", async () => {
    const { list, wrapper } = await mountList();
    emitter.emit("togglePinConversation", "a");
    await flushPromises();
    expect(list.metadata.value.find((c) => c.id === "a").pinned).toBe(true);
    emitter.emit("togglePinConversation", "a");
    await flushPromises();
    expect(list.metadata.value.find((c) => c.id === "a").pinned).toBe(false);
    wrapper.unmount();
  });

  it("stops listening once the list is unmounted", async () => {
    const { list, wrapper } = await mountList();
    wrapper.unmount();
    emitter.emit("renameConversation", "a");
    expect(list.renamingId.value).toBeNull();
  });
});
