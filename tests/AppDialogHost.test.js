/**
 * Mount tests for app/components/AppDialogHost.vue.
 *
 * These are the tests that would have caught the native-dialog era: the
 * host must render the queued dialog, resolve promises with the right
 * values, and clean up when the queue empties.
 *
 * The dialogs composable is a singleton — each test drains leftovers via
 * unmount + settle so cases stay isolated.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import {
  alertDialog,
  confirmDialog,
  promptDialog,
  useDialogState,
  settleDialog,
} from "../app/composables/useDialogs";
import AppDialogHost from "../app/components/AppDialogHost.vue";

const state = useDialogState();

function drain() {
  let guard = 0;
  while (state.current && guard++ < 10) settleDialog(false);
  state.current = null;
}

beforeEach(() => drain());

describe("AppDialogHost", () => {
  it("renders nothing when no dialog is queued", () => {
    const wrapper = mount(AppDialogHost);
    expect(wrapper.find(".dlg-overlay").exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders a confirm dialog and resolves true on the confirm button", async () => {
    const wrapper = mount(AppDialogHost);
    const p = confirmDialog({
      title: "Delete file",
      message: "Are you sure?",
      confirmLabel: "Delete",
    });
    await flushPromises();

    expect(wrapper.find(".dlg-overlay").exists()).toBe(true);
    expect(wrapper.text()).toContain("Delete file");
    expect(wrapper.text()).toContain("Are you sure?");

    const buttons = wrapper.findAll("button");
    const confirmBtn = buttons.find((b) => b.text() === "Delete");
    await confirmBtn.trigger("click");
    await expect(p).resolves.toBe(true);
    await nextFrame(wrapper);
    wrapper.unmount();
  });

  it("resolves false on the cancel button", async () => {
    const wrapper = mount(AppDialogHost);
    const p = confirmDialog({ title: "Leave?", cancelLabel: "Stay" });
    await flushPromises();

    const cancelBtn = wrapper.findAll("button").find((b) => b.text() === "Stay");
    await cancelBtn.trigger("click");
    await expect(p).resolves.toBe(false);
    wrapper.unmount();
  });

  it("resolves false on backdrop click", async () => {
    const wrapper = mount(AppDialogHost);
    const p = confirmDialog({ title: "Backdrop?" });
    await flushPromises();

    await wrapper.find(".dlg-overlay").trigger("pointerdown");
    await expect(p).resolves.toBe(false);
    wrapper.unmount();
  });

  it("marks danger confirms with the danger class", async () => {
    const wrapper = mount(AppDialogHost);
    const p = confirmDialog({ title: "Destructive", danger: true });
    await flushPromises();

    expect(wrapper.find(".dlg-btn.danger").exists()).toBe(true);
    settleDialog(true);
    await p;
    wrapper.unmount();
  });

  it("promptDialog prefills the input and Enter submits the trimmed value", async () => {
    const wrapper = mount(AppDialogHost);
    const p = promptDialog({ title: "Rename", initial: "  old.md  ", placeholder: "New name" });
    await flushPromises();

    const input = wrapper.find(".dlg-input");
    expect(input.element.value).toBe("  old.md  ");

    input.element.value = "  new.md  ";
    await input.trigger("input");
    await input.trigger("keydown.enter");

    await expect(p).resolves.toBe("new.md");
    wrapper.unmount();
  });

  it("promptDialog resolves null on Escape", async () => {
    const wrapper = mount(AppDialogHost);
    const p = promptDialog({ title: "Rename" });
    await flushPromises();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(p).resolves.toBeNull();
    wrapper.unmount();
  });

  it("confirmDialog resolves false on Escape", async () => {
    const wrapper = mount(AppDialogHost);
    const p = confirmDialog({ title: "Esc test" });
    await flushPromises();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(p).resolves.toBe(false);
    wrapper.unmount();
  });

  it("alertDialog hides the cancel button and resolves true", async () => {
    const wrapper = mount(AppDialogHost);
    const p = alertDialog({ title: "Heads up", message: "It broke." });
    await flushPromises();

    expect(wrapper.text()).toContain("It broke.");
    const labels = wrapper.findAll("button").map((b) => b.text());
    expect(labels).toEqual(["OK"]);

    await wrapper.findAll("button")[0].trigger("click");
    await expect(p).resolves.toBe(true);
    wrapper.unmount();
  });

  it("queues a second dialog and shows it after the first settles", async () => {
    const wrapper = mount(AppDialogHost);
    const first = confirmDialog({ title: "First" });
    const second = alertDialog({ title: "Second" });
    await flushPromises();

    expect(wrapper.text()).toContain("First");
    settleDialog(true);
    await flushPromises();

    expect(wrapper.text()).toContain("Second");
    settleDialog(true);
    await Promise.all([first, second]);
    wrapper.unmount();
  });

  it("hides the input row for non-prompt kinds", async () => {
    const wrapper = mount(AppDialogHost);
    const p = confirmDialog({ title: "No input here" });
    await flushPromises();

    expect(wrapper.find(".dlg-input").exists()).toBe(false);
    settleDialog(true);
    await p;
    wrapper.unmount();
  });
});

/** Lets Vue process the state change that unmounts the overlay. */
async function nextFrame(wrapper) {
  await flushPromises();
  await wrapper.vm.$nextTick();
}
