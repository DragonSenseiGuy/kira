/**
 * Tests for app/utils/keybinds.js — customizable shortcut helpers.
 */

import { describe, it, expect } from "vitest";
import {
  KEYBIND_ACTIONS,
  normalizeCombo,
  formatComboParts,
  eventToCombo,
  reservedComboWarning,
  isTextEntryTarget,
} from "../app/utils/keybinds.js";

function keyEvent(overrides = {}) {
  return {
    key: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    getModifierState: () => false,
    ...overrides,
  };
}

describe("normalizeCombo", () => {
  it("canonicalizes modifier order and casing", () => {
    expect(normalizeCombo("Alt+Mod+N")).toBe("mod+alt+n");
    expect(normalizeCombo("SHIFT + CTRL + k")).toBe("ctrl+shift+k");
  });

  it("maps aliases (control→ctrl, cmd/command→mod, option→alt, esc→escape)", () => {
    expect(normalizeCombo("Cmd+Shift+P")).toBe("mod+shift+p");
    expect(normalizeCombo("Control+Alt+Delete")).toBe("ctrl+alt+delete");
    expect(normalizeCombo("Esc")).toBe("escape");
    expect(normalizeCombo("Option+Q")).toBe("alt+q");
  });

  it("returns null when there is no non-modifier key", () => {
    expect(normalizeCombo("ctrl+alt")).toBeNull();
    expect(normalizeCombo("")).toBeNull();
    expect(normalizeCombo(null)).toBeNull();
  });

  it("handles single keys and space", () => {
    expect(normalizeCombo("/")).toBe("/");
    expect(normalizeCombo("Space")).toBe("space");
    expect(normalizeCombo("mod+space")).toBe("mod+space");
  });
});

describe("formatComboParts", () => {
  it("renders platform-appropriate labels", () => {
    expect(formatComboParts("mod+alt+n", true)).toEqual(["⌘", "⌥", "N"]);
    expect(formatComboParts("mod+alt+n", false)).toEqual(["Ctrl", "Alt", "N"]);
  });

  it("formats single keys and special names", () => {
    expect(formatComboParts("/", false)).toEqual(["/"]);
    expect(formatComboParts("space", false)).toEqual(["Space"]);
    expect(formatComboParts("escape", false)).toEqual(["Esc"]);
    expect(formatComboParts("arrowup", false)).toEqual(["↑"]);
  });
});

describe("eventToCombo", () => {
  it("builds combos from keyboard events per platform", () => {
    const e = keyEvent({ key: "n", ctrlKey: true, altKey: true });
    expect(eventToCombo(e, false)).toBe("mod+alt+n");

    const mac = keyEvent({ key: "n", metaKey: true, altKey: true });
    expect(eventToCombo(mac, true)).toBe("mod+alt+n");
  });

  it("treats Ctrl on Mac as ctrl, not mod", () => {
    const e = keyEvent({ key: "k", ctrlKey: true });
    expect(eventToCombo(e, true)).toBe("ctrl+k");
  });

  it("includes shift and ignores modifier-only presses", () => {
    expect(eventToCombo(keyEvent({ key: "K", shiftKey: true }), false)).toBe("shift+k");
    expect(eventToCombo(keyEvent({ key: "Control", ctrlKey: true }), false)).toBeNull();
    expect(eventToCombo(keyEvent({ key: "Meta", metaKey: true }), true)).toBeNull();
  });
});

describe("reservedComboWarning", () => {
  it("flags browser-reserved tab/window management", () => {
    expect(reservedComboWarning("mod+t")).toMatch(/tab\/window/i);
    expect(reservedComboWarning("mod+w")).toMatch(/tab\/window/i);
    expect(reservedComboWarning("mod+n")).toMatch(/tab\/window/i);
    expect(reservedComboWarning("mod+shift+t")).toMatch(/reserve/i);
  });

  it("allows everything else", () => {
    expect(reservedComboWarning("mod+alt+n")).toBeNull();
    expect(reservedComboWarning("mod+b")).toBeNull();
    expect(reservedComboWarning("/")).toBeNull();
  });
});

describe("isTextEntryTarget", () => {
  it("detects typing surfaces", () => {
    expect(isTextEntryTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEntryTarget({ isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

describe("KEYBIND_ACTIONS defaults", () => {
  it("every action has a valid default combo and unique id", () => {
    const ids = KEYBIND_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const action of KEYBIND_ACTIONS) {
      expect(normalizeCombo(action.default)).not.toBeNull();
      expect(reservedComboWarning(action.default)).toBeNull();
    }
  });
});
