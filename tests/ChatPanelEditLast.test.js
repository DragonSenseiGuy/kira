/**
 * Mount tests for ChatPanel.editLastUserMessage, which the composer calls
 * when Up is pressed in an empty textarea.
 */

import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ChatPanel from "../app/components/ChatPanel.vue";
import MessageEditArea from "../app/components/MessageEditArea.vue";

function mountPanel(messages) {
  return mount(ChatPanel, {
    attachTo: document.body,
    props: { currConvo: "c1", currMessages: messages },
    global: {
      components: { MessageEditArea },
      stubs: {
        UiTooltip: { template: "<span><slot /></span>" },
        UiIconButton: { template: "<button />" },
        StreamingMessage: true,
        ChatWidget: true,
        ContextSummaryMarker: true,
        Icon: true,
      },
    },
  });
}

const chat = [
  { id: "u1", role: "user", content: "first", complete: true },
  { id: "a1", role: "assistant", content: "answer", complete: true },
  { id: "u2", role: "user", content: "second", complete: true },
  { id: "a2", role: "assistant", content: "answer two", complete: true },
];

describe("ChatPanel.editLastUserMessage", () => {
  it("opens the most recent user message and focuses its editor", async () => {
    const wrapper = mountPanel(chat);

    expect(wrapper.vm.editLastUserMessage()).toBe(true);
    await flushPromises();

    const editors = wrapper.findAll(".edit-textarea");
    expect(editors).toHaveLength(1);
    expect(editors[0].element.value).toBe("second");
    expect(document.activeElement).toBe(editors[0].element);
    expect(editors[0].element.selectionStart).toBe("second".length);
    wrapper.unmount();
  });

  it("returns focus to where it was when the edit is cancelled", async () => {
    const composer = document.createElement("textarea");
    document.body.appendChild(composer);
    composer.focus();
    const wrapper = mountPanel(chat);

    wrapper.vm.editLastUserMessage();
    await flushPromises();
    await wrapper.find(".edit-textarea").trigger("keydown.esc");
    await flushPromises();

    expect(wrapper.find(".edit-textarea").exists()).toBe(false);
    expect(document.activeElement).toBe(composer);
    wrapper.unmount();
    composer.remove();
  });

  it("does nothing when there is no user message", async () => {
    const wrapper = mountPanel([]);

    expect(wrapper.vm.editLastUserMessage()).toBe(false);
    await flushPromises();
    expect(wrapper.find(".edit-textarea").exists()).toBe(false);
    wrapper.unmount();
  });
});
