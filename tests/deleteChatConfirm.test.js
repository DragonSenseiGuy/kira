/**
 * Deleting a chat from the sidebar asks first.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("localforage", () => ({
  default: { getItem: vi.fn().mockResolvedValue([]), setItem: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("~/composables/storeConversations", () => ({
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}));

import { deleteConversation } from "~/composables/storeConversations";
import { useConversationsList } from "~/composables/useConversationsList";
import { useDialogState, settleDialog } from "~/composables/useDialogs";

const dialog = useDialogState();

function mountList() {
  let api;
  const wrapper = mount(defineComponent({
    setup() {
      api = useConversationsList();
      return () => h("div");
    },
  }));
  return { api, wrapper };
}

describe("deleting a chat", () => {
  beforeEach(() => {
    vi.mocked(deleteConversation).mockClear();
    while (dialog.current) settleDialog(false);
  });

  it("asks before deleting and names the chat", async () => {
    const { api, wrapper } = mountList();
    const pending = api.handleDelete("c1", "Trip plan");
    await flushPromises();

    expect(dialog.current).toMatchObject({ kind: "confirm", title: "Delete chat?", confirmLabel: "Delete", danger: true });
    expect(dialog.current.message).toContain('"Trip plan"');
    expect(deleteConversation).not.toHaveBeenCalled();

    settleDialog(true);
    await pending;
    expect(deleteConversation).toHaveBeenCalledWith("c1");
    wrapper.unmount();
  });

  it("keeps the chat when cancelled", async () => {
    const { api, wrapper } = mountList();
    const pending = api.handleDelete("c1", "Trip plan");
    await flushPromises();
    settleDialog(false);
    await pending;

    expect(deleteConversation).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("copes with a missing title and shortens a long one", async () => {
    const { api, wrapper } = mountList();
    let pending = api.handleDelete("c1");
    await flushPromises();
    expect(dialog.current.message).toContain("This chat will be deleted.");
    settleDialog(false);
    await pending;

    pending = api.handleDelete("c1", "x".repeat(300));
    await flushPromises();
    expect(dialog.current.message).toContain('"' + "x".repeat(80) + '…"');
    settleDialog(false);
    await pending;
    wrapper.unmount();
  });
});
