// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import MessageEditArea from "~/components/MessageEditArea.vue";

let wrapper;
function mountEditor(message) {
  wrapper = mount(MessageEditArea, {
    props: { message },
    global: { stubs: { Icon: true } },
    attachTo: document.body,
  });
  return wrapper;
}

afterEach(() => wrapper?.unmount());

describe("MessageEditArea", () => {
  it("opens focused with the caret after the existing text", () => {
    mountEditor({ content: "hello there", attachments: [] });
    const textarea = wrapper.find("textarea").element;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(11);
    expect(textarea.selectionEnd).toBe(11);
  });

  it("hands focus back to where it was when editing is cancelled", async () => {
    const editButton = document.createElement("button");
    document.body.appendChild(editButton);
    editButton.focus();
    mountEditor({ content: "hello", attachments: [] });
    expect(document.activeElement).toBe(wrapper.find("textarea").element);

    await wrapper.find("textarea").trigger("keydown", { key: "Escape" });
    await nextTick();

    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(document.activeElement).toBe(editButton);
    editButton.remove();
  });

  it("disables Save once the text is cleared and nothing is attached", async () => {
    mountEditor({ content: "hello", attachments: [] });
    const save = wrapper.find(".edit-save");
    expect(save.attributes("disabled")).toBeUndefined();
    await wrapper.find("textarea").setValue("   ");
    expect(save.attributes("disabled")).toBeDefined();
    await save.trigger("click");
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("keeps Save available for an attachment without text", async () => {
    mountEditor({
      content: "",
      attachments: [{ id: "a", type: "image", dataUrl: "data:image/png;base64,AA==", filename: "a.png" }],
    });
    const save = wrapper.find(".edit-save");
    expect(save.attributes("disabled")).toBeUndefined();
    await wrapper.find(".remove-attachment-btn").trigger("click");
    expect(save.attributes("disabled")).toBeDefined();
  });
});
