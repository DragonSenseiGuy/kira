// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageEditArea from "~/components/MessageEditArea.vue";

describe("accessible names", () => {
  it("names the edit field and the remove-attachment button", () => {
    const wrapper = mount(MessageEditArea, {
      props: {
        message: {
          content: "hello",
          attachments: [{ type: "file", filename: "notes.txt", mimeType: "text/plain" }],
        },
      },
      global: { stubs: { Icon: true } },
    });
    expect(wrapper.find("textarea").attributes("aria-label")).toBe("Edit your message");
    expect(wrapper.find(".remove-attachment-btn").attributes("aria-label")).toBe("Remove attachment");
  });
});
