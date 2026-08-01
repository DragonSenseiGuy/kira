/**
 * Tests for app/composables/keyboardShortcuts.js
 *
 * The registry drives key handling, the palette hints, and the Settings
 * reference list at once, so these tests cover both the matching rules
 * (platform mapping, modifier strictness, typing guards) and the registry's
 * own integrity.
 */

import { describe, it, expect } from "vitest";
import {
  SHORTCUTS,
  parseCombo,
  matchesCombo,
  firesWhileTyping,
  isTypingTarget,
  findShortcut,
  formatCombo,
  groupShortcuts,
} from "../app/composables/keyboardShortcuts.js";

/** Builds a keyboard-event-like object. */
const keyEvent = (key, modifiers = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  target: null,
  ...modifiers,
});

describe("parseCombo", () => {
  it("parses a bare key", () => {
    expect(parseCombo("k")).toEqual({ mod: false, alt: false, shift: false, key: "k" });
  });

  it("parses modifiers in any order", () => {
    expect(parseCombo("alt+mod+n")).toEqual({ mod: true, alt: true, shift: false, key: "n" });
  });

  it("lowercases the key", () => {
    expect(parseCombo("mod+K").key).toBe("k");
  });

  it("handles named keys", () => {
    expect(parseCombo("shift+enter")).toEqual({
      mod: false,
      alt: false,
      shift: true,
      key: "enter",
    });
  });

  it("returns an empty combo for junk input", () => {
    expect(parseCombo(null)).toEqual({ mod: false, alt: false, shift: false, key: "" });
    expect(parseCombo("")).toEqual({ mod: false, alt: false, shift: false, key: "" });
  });
});

describe("matchesCombo", () => {
  it("maps mod to Meta on a Mac", () => {
    expect(matchesCombo(keyEvent("k", { metaKey: true }), "mod+k", { isMac: true })).toBe(true);
    expect(matchesCombo(keyEvent("k", { ctrlKey: true }), "mod+k", { isMac: true })).toBe(false);
  });

  it("maps mod to Ctrl elsewhere", () => {
    expect(matchesCombo(keyEvent("k", { ctrlKey: true }), "mod+k", { isMac: false })).toBe(true);
    expect(matchesCombo(keyEvent("k", { metaKey: true }), "mod+k", { isMac: false })).toBe(false);
  });

  it("rejects the wrong key", () => {
    expect(matchesCombo(keyEvent("j", { metaKey: true }), "mod+k", { isMac: true })).toBe(false);
  });

  it("rejects a missing modifier", () => {
    expect(matchesCombo(keyEvent("k"), "mod+k", { isMac: true })).toBe(false);
  });

  it("rejects an extra modifier", () => {
    expect(
      matchesCombo(keyEvent("k", { metaKey: true, altKey: true }), "mod+k", { isMac: true }),
    ).toBe(false);
  });

  it("rejects the opposite platform's modifier being held too", () => {
    expect(
      matchesCombo(keyEvent("k", { metaKey: true, ctrlKey: true }), "mod+k", { isMac: true }),
    ).toBe(false);
  });

  it("requires every modifier of a three-key chord", () => {
    const combo = "mod+alt+n";
    expect(matchesCombo(keyEvent("n", { metaKey: true, altKey: true }), combo, { isMac: true })).toBe(true);
    expect(matchesCombo(keyEvent("n", { metaKey: true }), combo, { isMac: true })).toBe(false);
    expect(matchesCombo(keyEvent("n", { altKey: true }), combo, { isMac: true })).toBe(false);
  });

  it("is case insensitive about the reported key", () => {
    expect(matchesCombo(keyEvent("K", { metaKey: true }), "mod+k", { isMac: true })).toBe(true);
  });

  it("matches ? even though typing it requires Shift", () => {
    expect(matchesCombo(keyEvent("?", { shiftKey: true }), "?")).toBe(true);
  });

  it("still enforces Shift for alphanumeric combos", () => {
    expect(matchesCombo(keyEvent("k", { metaKey: true, shiftKey: true }), "mod+k", { isMac: true }))
      .toBe(false);
  });

  it("falls back to the physical key when Option rewrites the character", () => {
    // macOS turns ⌥N into a dead key, so `key` is not "n".
    const event = keyEvent("-", { metaKey: true, altKey: true, code: "KeyN" });
    expect(matchesCombo(event, "mod+alt+n", { isMac: true })).toBe(true);
  });

  it("does not let the physical-key fallback match a different letter", () => {
    const event = keyEvent("-", { metaKey: true, altKey: true, code: "KeyM" });
    expect(matchesCombo(event, "mod+alt+n", { isMac: true })).toBe(false);
  });

  it("supports the physical-key fallback for digits", () => {
    const event = keyEvent("¡", { metaKey: true, altKey: true, code: "Digit1" });
    expect(matchesCombo(event, "mod+alt+1", { isMac: true })).toBe(true);
  });

  it("does not apply the physical-key fallback to named keys", () => {
    const event = keyEvent("x", { code: "Enter" });
    expect(matchesCombo(event, "enter")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(matchesCombo(null, "mod+k")).toBe(false);
    expect(matchesCombo(keyEvent("k"), "")).toBe(false);
  });
});

describe("isTypingTarget", () => {
  it("detects inputs, textareas, and selects", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
  });

  it("detects contenteditable regions", () => {
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("ignores ordinary elements", () => {
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
  });

  it("tolerates a missing target", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe("firesWhileTyping", () => {
  it("allows modifier chords", () => {
    expect(firesWhileTyping({ combo: "mod+k" })).toBe(true);
    expect(firesWhileTyping({ combo: "mod+alt+n" })).toBe(true);
  });

  it("blocks bare keys", () => {
    expect(firesWhileTyping({ combo: "?" })).toBe(false);
    expect(firesWhileTyping({ combo: "/" })).toBe(false);
  });
});

describe("findShortcut", () => {
  it("finds the palette shortcut", () => {
    const found = findShortcut(keyEvent("k", { metaKey: true }), { isMac: true });
    expect(found?.action).toBe("openPalette");
  });

  it("returns null when nothing matches", () => {
    expect(findShortcut(keyEvent("q"), { isMac: true })).toBeNull();
  });

  it("never returns a documentation-only entry", () => {
    // "/" is documented but handled by the composer itself.
    expect(findShortcut(keyEvent("/"), { isMac: true })).toBeNull();
  });

  it("suppresses bare-key shortcuts while typing", () => {
    const typing = keyEvent("?", { shiftKey: true, target: { tagName: "TEXTAREA" } });
    expect(findShortcut(typing, { isMac: true })).toBeNull();
  });

  it("still fires modifier chords while typing", () => {
    const typing = keyEvent("k", { metaKey: true, target: { tagName: "TEXTAREA" } });
    expect(findShortcut(typing, { isMac: true })?.action).toBe("openPalette");
  });

  it("fires the help shortcut outside of a text field", () => {
    const event = keyEvent("?", { shiftKey: true, target: { tagName: "DIV" } });
    expect(findShortcut(event, { isMac: true })?.action).toBe("openShortcutHelp");
  });

  it("accepts a custom registry", () => {
    const custom = [{ id: "x", combo: "mod+j", action: "doThing" }];
    const found = findShortcut(keyEvent("j", { metaKey: true }), { isMac: true, shortcuts: custom });
    expect(found?.action).toBe("doThing");
  });
});

describe("formatCombo", () => {
  it("uses Mac glyphs", () => {
    expect(formatCombo("mod+alt+n", true)).toEqual(["⌘", "⌥", "N"]);
  });

  it("uses spelled-out names elsewhere", () => {
    expect(formatCombo("mod+alt+n", false)).toEqual(["Ctrl", "Alt", "N"]);
  });

  it("renders named keys readably", () => {
    expect(formatCombo("shift+enter", true)).toEqual(["⇧", "Enter"]);
    expect(formatCombo("arrowdown", true)).toEqual(["↓"]);
  });

  it("passes punctuation keys through", () => {
    expect(formatCombo("?", true)).toEqual(["?"]);
  });

  it("returns an empty list for an empty combo", () => {
    expect(formatCombo("", true)).toEqual([]);
  });
});

describe("groupShortcuts", () => {
  it("groups entries and preserves first-seen order", () => {
    const groups = groupShortcuts();
    expect(groups[0].group).toBe("General");
    expect(groups.map((g) => g.group)).toContain("Text input");
  });

  it("keeps every shortcut", () => {
    const total = groupShortcuts().reduce((sum, g) => sum + g.shortcuts.length, 0);
    expect(total).toBe(SHORTCUTS.length);
  });
});

describe("SHORTCUTS registry integrity", () => {
  it("gives every entry a unique id", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a label, group, and combo", () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.label, shortcut.id).toBeTruthy();
      expect(shortcut.group, shortcut.id).toBeTruthy();
      expect(parseCombo(shortcut.combo).key, shortcut.id).toBeTruthy();
    }
  });

  it("gives every runnable entry an action", () => {
    for (const shortcut of SHORTCUTS) {
      if (shortcut.documentedOnly) continue;
      expect(shortcut.action, shortcut.id).toBeTruthy();
    }
  });

  it("has no two runnable entries bound to the same chord", () => {
    const runnable = SHORTCUTS.filter((s) => !s.documentedOnly);
    const combos = runnable.map((s) => {
      const { mod, alt, shift, key } = parseCombo(s.combo);
      return `${mod}|${alt}|${shift}|${key}`;
    });
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("only binds chords that survive being pressed inside a text box", () => {
    // A bare-key binding that the composer also uses would be ambiguous.
    for (const shortcut of SHORTCUTS) {
      if (shortcut.documentedOnly) continue;
      const event = keyEvent(parseCombo(shortcut.combo).key, {
        metaKey: parseCombo(shortcut.combo).mod,
        altKey: parseCombo(shortcut.combo).alt,
        shiftKey: true,
        target: { tagName: "TEXTAREA" },
      });
      const found = findShortcut(event, { isMac: true });
      if (!firesWhileTyping(shortcut)) expect(found?.id).not.toBe(shortcut.id);
    }
  });
});
