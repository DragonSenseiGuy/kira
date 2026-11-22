/**
 * Typing anywhere on the page moves focus to the composer.
 */

import { describe, it, expect, afterEach } from "vitest";
import { shouldFocusComposerOnKey } from "../app/utils/typeToFocus";

function key(init, target = document.body) {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldFocusComposerOnKey", () => {
  it("accepts printable characters, including shifted ones and emoji", () => {
    expect(shouldFocusComposerOnKey(key({ key: "a" }))).toBe(true);
    expect(shouldFocusComposerOnKey(key({ key: "A", shiftKey: true }))).toBe(true);
    expect(shouldFocusComposerOnKey(key({ key: "?" }))).toBe(true);
    expect(shouldFocusComposerOnKey(key({ key: "😀" }))).toBe(true);
  });

  it("ignores shortcuts, navigation keys and Space", () => {
    expect(shouldFocusComposerOnKey(key({ key: "c", ctrlKey: true }))).toBe(false);
    expect(shouldFocusComposerOnKey(key({ key: "c", metaKey: true }))).toBe(false);
    expect(shouldFocusComposerOnKey(key({ key: "c", altKey: true }))).toBe(false);
    for (const name of ["Enter", "Tab", "Escape", "ArrowDown", "PageDown", "F5", "Shift", " "]) {
      expect(shouldFocusComposerOnKey(key({ key: name }))).toBe(false);
    }
  });

  it("ignores keys already going to a text field", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(shouldFocusComposerOnKey(key({ key: "a" }, document.createElement(tag)))).toBe(false);
    }
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(shouldFocusComposerOnKey(key({ key: "a" }, editable))).toBe(false);
  });

  it("ignores keys another handler already used and IME composition", () => {
    const used = key({ key: "/" });
    used.preventDefault();
    expect(shouldFocusComposerOnKey(used)).toBe(false);
    expect(shouldFocusComposerOnKey(key({ key: "a", isComposing: true }))).toBe(false);
  });

  it("stands down while a dialog or menu is open", () => {
    for (const overlay of ['role="dialog" aria-modal="true"', 'role="alertdialog"', 'role="menu"', 'role="listbox"']) {
      document.body.innerHTML = `<div ${overlay}></div>`;
      expect(shouldFocusComposerOnKey(key({ key: "a" }))).toBe(false);
    }
  });

  it("is not stopped by a non-modal panel or a hidden overlay", () => {
    document.body.innerHTML = '<div role="dialog" aria-label="Workspace"></div><div role="menu" id="m"></div>';
    document.getElementById("m").checkVisibility = () => false;
    expect(shouldFocusComposerOnKey(key({ key: "a" }))).toBe(true);
  });
});
