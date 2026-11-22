/**
 * Images in a chat open full size when clicked.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ChatPanel from "../app/components/ChatPanel.vue";

function mountPanel(messages) {
  return mount(ChatPanel, {
    attachTo: document.body,
    props: { currConvo: "c1", currMessages: messages },
    global: {
      stubs: {
        UiTooltip: { template: "<span><slot /></span>" },
        UiIconButton: { template: "<button />" },
        StreamingMessage: true,
        ChatWidget: true,
        ContextSummaryMarker: true,
        MessageEditArea: true,
        Icon: true,
      },
    },
  });
}

const png = "data:image/png;base64,iVBORw0KGgo=";
const withImage = {
  id: "u1",
  role: "user",
  content: "what is this?",
  complete: true,
  attachments: [
    { id: "f1", type: "image", filename: "cat.png", dataUrl: png },
    { id: "f2", type: "pdf", filename: "notes.pdf", dataUrl: "data:application/pdf;base64,AA==" },
  ],
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("image lightbox", () => {
  it("opens an attached image full size and closes again", async () => {
    const wrapper = mountPanel([withImage]);
    expect(document.querySelector(".lightbox")).toBeNull();

    const open = wrapper.find(".image-open");
    expect(open.attributes("aria-label")).toBe("View cat.png full size");
    await open.trigger("click");
    await flushPromises();

    const shown = document.querySelector(".lightbox-image");
    expect(shown.getAttribute("src")).toBe(png);
    expect(shown.getAttribute("alt")).toBe("cat.png");
    expect(document.querySelector(".lightbox").getAttribute("role")).toBe("dialog");

    document.querySelector(".lightbox-close").click();
    await flushPromises();
    expect(document.querySelector(".lightbox-image")).toBeNull();
    wrapper.unmount();
  });

  it("offers it only for images, not other attachments", () => {
    const wrapper = mountPanel([withImage]);
    expect(wrapper.findAll(".image-open")).toHaveLength(1);
    wrapper.unmount();
  });
});
