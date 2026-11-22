/**
 * Escape stops the reply being generated.
 */

import { describe, it, expect, afterEach } from "vitest";
import { shouldStopOnEscape } from "../app/utils/escapeToStop";

function key(init = {}, target = document.body) {
  const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldStopOnEscape", () => {
  it("accepts a plain Escape on the page", () => {
    expect(shouldStopOnEscape(key())).toBe(true);
  });

  it("ignores other keys, modified Escape, IME composition and used events", () => {
    expect(shouldStopOnEscape(key({ key: "Enter" }))).toBe(false);
    expect(shouldStopOnEscape(key({ shiftKey: true }))).toBe(false);
    expect(shouldStopOnEscape(key({ ctrlKey: true }))).toBe(false);
    expect(shouldStopOnEscape(key({ isComposing: true }))).toBe(false);
    const used = key();
    used.preventDefault();
    expect(shouldStopOnEscape(used)).toBe(false);
  });

  it("accepts Escape in the composer but not in other text fields", () => {
    const composer = document.createElement("textarea");
    const other = document.createElement("input");
    expect(shouldStopOnEscape(key({}, composer), composer)).toBe(true);
    expect(shouldStopOnEscape(key({}, other), composer)).toBe(false);
  });

  it("leaves Escape to an open dialog, menu, list or popover", () => {
    for (const overlay of [
      'role="dialog" aria-modal="true"',
      'role="alertdialog"',
      'role="menu"',
      'role="listbox"',
      "data-reka-popper-content-wrapper",
    ]) {
      document.body.innerHTML = `<div ${overlay}></div>`;
      expect(shouldStopOnEscape(key())).toBe(false);
    }
  });

  it("is not blocked by the docked workspace panel or a hidden overlay", () => {
    document.body.innerHTML = '<div role="dialog" aria-label="Workspace"></div><div role="menu" id="m"></div>';
    document.getElementById("m").checkVisibility = () => false;
    expect(shouldStopOnEscape(key())).toBe(true);
  });
});
