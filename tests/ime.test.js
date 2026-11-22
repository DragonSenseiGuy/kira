// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { isImeKey } from "~/utils/ime";
import MessageEditArea from "~/components/MessageEditArea.vue";

describe("isImeKey", () => {
  it("is true while a candidate is being composed", () => {
    expect(isImeKey({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it("is true for Safari's confirming Enter", () => {
    expect(isImeKey({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("is false for an ordinary key press", () => {
    expect(isImeKey({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeKey(undefined)).toBe(false);
  });
});

describe("MessageEditArea with an input method", () => {
  function mountEditor() {
    vi.stubGlobal("innerWidth", 1200);
    return mount(MessageEditArea, {
      props: { message: { content: "こんにちは", attachments: [] } },
      global: { stubs: { Icon: true } },
    });
  }

  it("does not submit on the Enter that confirms a candidate", async () => {
    const wrapper = mountEditor();
    await wrapper.find("textarea").trigger("keydown", { key: "Enter", isComposing: true });
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("still submits on a plain Enter", async () => {
    const wrapper = mountEditor();
    await wrapper.find("textarea").trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("submit")).toHaveLength(1);
  });
});
