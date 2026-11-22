/**
 * A reply that failed offers "Try again", and still does after a reload.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const store = vi.hoisted(() => new Map());
vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => store.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { store.set(key, value); }),
    removeItem: vi.fn(async (key) => { store.delete(key); }),
  },
}));
vi.mock("~/composables/useCloudSync", () => ({
  useCloudSync: () => ({ syncConversation: vi.fn(), deleteConversation: vi.fn() }),
}));

import ChatPanel from "../app/components/ChatPanel.vue";
import { storeMessages } from "../app/composables/storeConversations";

function mountPanel(messages, props = {}) {
  return mount(ChatPanel, {
    props: { currConvo: "c1", currMessages: messages, ...props },
    global: {
      stubs: {
        UiTooltip: { template: "<span><slot /></span>" },
        UiIconButton: { template: "<button />" },
        UiButton: { template: "<button><slot /></button>" },
        StreamingMessage: true,
        ChatWidget: true,
        ContextSummaryMarker: true,
        MessageEditArea: true,
        Icon: true,
      },
    },
  });
}

const user = { id: "u1", role: "user", content: "hi", complete: true };
const failed = { id: "a1", role: "assistant", content: "partial", complete: true, error: true };

describe("Try again under a failed reply", () => {
  it("asks for the failed reply to be regenerated", async () => {
    const wrapper = mountPanel([user, failed]);
    expect(wrapper.find(".reply-failed").text()).toContain("This reply did not finish.");

    await wrapper.find(".retry-button").trigger("click");
    expect(wrapper.emitted("regenerate-message")).toEqual([["a1"]]);
    wrapper.unmount();
  });

  it("is shown for a failed reply that lost its flag in account sync", () => {
    const synced = { id: "a1", role: "assistant", complete: true, content: "partial\n\n---\n⚠️ **Error:** Bad gateway (HTTP 502)" };
    const wrapper = mountPanel([user, synced]);
    expect(wrapper.find(".retry-button").exists()).toBe(true);
    wrapper.unmount();
  });

  it("is not shown for a reply that only mentions an error block mid-text", () => {
    const quoted = { id: "a1", role: "assistant", complete: true, content: "---\n⚠️ **Error:** nope\nthat is what it prints" };
    const wrapper = mountPanel([user, quoted]);
    expect(wrapper.find(".reply-failed").exists()).toBe(false);
    wrapper.unmount();
  });

  it("is not shown for replies that succeeded", () => {
    const wrapper = mountPanel([user, { ...failed, error: false }]);
    expect(wrapper.find(".reply-failed").exists()).toBe(false);
    wrapper.unmount();
  });

  it("is hidden while another reply is being generated", () => {
    const wrapper = mountPanel([user, failed], { isLoading: true });
    expect(wrapper.find(".reply-failed").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("failed replies in storage", () => {
  beforeEach(() => {
    store.clear();
    store.set("conversation_c1", { title: "T", messages: [], branchPath: [] });
  });

  it("keeps the failed flag, and adds none to other messages", async () => {
    await storeMessages("c1", [user, failed, { id: "a2", role: "assistant", content: "ok", complete: true }], new Date());
    const saved = store.get("conversation_c1").messages;

    expect(saved[1].error).toBe(true);
    expect("error" in saved[0]).toBe(false);
    expect("error" in saved[2]).toBe(false);
  });
});
