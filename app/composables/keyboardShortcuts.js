/**
 * @file keyboardShortcuts.js
 * @description Single source of truth for Kira's global keyboard shortcuts.
 *
 * The registry below drives three things at once: the actual key handling, the
 * hints shown in the command palette, and the reference list in Settings →
 * Keyboard Shortcuts. Adding a shortcut in one place updates all three.
 *
 * Handling is a plain `keydown` listener rather than a reactive key-state
 * watcher: a watcher only fires if the modifier is still held when Vue flushes,
 * so a quick tap of ⌘K could be dropped.
 */

/** Combo tokens that are modifiers rather than the shortcut's key. */
const MODIFIER_TOKENS = new Set(["mod", "alt", "shift"]);

/**
 * Every shortcut Kira responds to or documents.
 *
 * `action` names the handler the app supplies; entries without one are
 * documentation for behaviour implemented closer to the component that owns it
 * (the composer's own key handling, for instance).
 *
 * @type {Array<Object>}
 */
export const SHORTCUTS = [
  {
    id: "command-palette",
    group: "General",
    label: "Open command palette",
    combo: "mod+k",
    action: "openPalette",
  },
  {
    id: "toggle-sidebar",
    group: "General",
    label: "Toggle main sidebar",
    combo: "mod+b",
    action: "toggleSidebar",
  },
  {
    id: "toggle-parameters",
    group: "General",
    label: "Toggle parameters panel",
    combo: "mod+alt+b",
    action: "toggleParameters",
  },
  {
    id: "new-chat",
    group: "General",
    label: "New chat",
    combo: "mod+alt+n",
    action: "newChat",
  },
  {
    id: "toggle-incognito",
    group: "General",
    label: "Toggle incognito mode",
    combo: "mod+alt+i",
    action: "toggleIncognito",
  },
  {
    id: "shortcut-help",
    group: "General",
    label: "Show keyboard shortcuts",
    combo: "?",
    action: "openShortcutHelp",
  },
  {
    id: "focus-composer",
    group: "Text input",
    label: "Focus the message box",
    combo: "/",
    documentedOnly: true,
  },
  {
    id: "send-message",
    group: "Text input",
    label: "Send message",
    combo: "enter",
    documentedOnly: true,
  },
  {
    id: "newline",
    group: "Text input",
    label: "Insert a new line",
    combo: "shift+enter",
    documentedOnly: true,
  },
  {
    id: "palette-navigate",
    group: "Command palette",
    label: "Move between results",
    combo: "arrowdown",
    documentedOnly: true,
  },
  {
    id: "palette-open-result",
    group: "Command palette",
    label: "Open the selected result",
    combo: "enter",
    documentedOnly: true,
  },
  {
    id: "palette-commands-mode",
    group: "Command palette",
    label: "Search commands only",
    combo: ">",
    documentedOnly: true,
  },
  {
    id: "palette-chats-mode",
    group: "Command palette",
    label: "Search chat titles only",
    combo: "@",
    documentedOnly: true,
  },
  {
    id: "palette-messages-mode",
    group: "Command palette",
    label: "Search message contents only",
    combo: "#",
    documentedOnly: true,
  },
];

/**
 * Parses a combo string such as `"mod+alt+n"` into its parts.
 *
 * @param {string} combo - The combo string.
 * @returns {{mod: boolean, alt: boolean, shift: boolean, key: string}}
 */
export function parseCombo(combo) {
  const parsed = { mod: false, alt: false, shift: false, key: "" };
  if (typeof combo !== "string") return parsed;

  for (const token of combo.toLowerCase().split("+")) {
    const part = token.trim();
    if (!part) continue;
    if (MODIFIER_TOKENS.has(part)) parsed[part] = true;
    else parsed.key = part;
  }

  return parsed;
}

/**
 * Whether a key can only be typed by holding Shift (so comparing the Shift
 * flag would never match). `?` is the motivating case.
 */
function keyImpliesShift(key) {
  return key.length === 1 && !/[a-z0-9]/.test(key);
}

/**
 * Tests whether an event's key is the one a combo asks for.
 *
 * `event.key` is the character produced, which macOS rewrites when Option is
 * held — ⌥N is a dead key, so `key` arrives as something other than "n" and a
 * naive comparison silently drops the shortcut. For single alphanumeric
 * bindings we therefore also accept the physical key from `event.code`.
 *
 * @param {KeyboardEvent} event - The event.
 * @param {string} key - The lowercased key a combo expects.
 * @returns {boolean}
 */
function matchesKey(event, key) {
  if (typeof event.key === "string" && event.key.toLowerCase() === key) return true;

  if (key.length === 1 && typeof event.code === "string") {
    if (/[a-z]/.test(key) && event.code === `Key${key.toUpperCase()}`) return true;
    if (/[0-9]/.test(key) && event.code === `Digit${key}`) return true;
  }

  return false;
}

/**
 * Tests a keyboard event against a combo.
 *
 * @param {KeyboardEvent} event - The event to test.
 * @param {string|Object} combo - A combo string or a parsed combo.
 * @param {Object} [options]
 * @param {boolean} [options.isMac=false] - Map `mod` to Meta instead of Ctrl.
 * @returns {boolean} Whether the event matches.
 */
export function matchesCombo(event, combo, options = {}) {
  if (!event || !event.key) return false;
  const { isMac = false } = options;
  const parsed = typeof combo === "string" ? parseCombo(combo) : combo;
  if (!parsed?.key) return false;

  if (!matchesKey(event, parsed.key)) return false;

  const modPressed = isMac ? event.metaKey : event.ctrlKey;
  // The non-`mod` modifier must stay clear, otherwise Ctrl+K on a Mac would
  // fire a shortcut the user didn't ask for.
  const otherModPressed = isMac ? event.ctrlKey : event.metaKey;

  if (modPressed !== parsed.mod) return false;
  if (otherModPressed) return false;
  if (event.altKey !== parsed.alt) return false;
  if (!keyImpliesShift(parsed.key) && event.shiftKey !== parsed.shift) return false;

  return true;
}

/**
 * Whether a shortcut should still fire while the user is typing.
 * Modifier-based chords are safe; bare keys like `?` are not.
 *
 * @param {Object} shortcut - A registry entry.
 * @returns {boolean}
 */
export function firesWhileTyping(shortcut) {
  const parsed = parseCombo(shortcut?.combo);
  return parsed.mod || parsed.alt;
}

/**
 * Whether an event originated from somewhere the user is entering text.
 *
 * @param {EventTarget} target - The event target.
 * @returns {boolean}
 */
export function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable) return true;

  const tag = typeof target.tagName === "string" ? target.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * Finds the runnable shortcut an event triggers.
 *
 * @param {KeyboardEvent} event - The event.
 * @param {Object} [options]
 * @param {boolean} [options.isMac=false] - Platform mapping for `mod`.
 * @param {Array<Object>} [options.shortcuts=SHORTCUTS] - Registry to search.
 * @returns {Object|null} The matching entry, or null.
 */
export function findShortcut(event, options = {}) {
  const { isMac = false, shortcuts = SHORTCUTS } = options;

  for (const shortcut of shortcuts) {
    if (shortcut.documentedOnly) continue;
    if (!matchesCombo(event, shortcut.combo, { isMac })) continue;
    if (isTypingTarget(event.target) && !firesWhileTyping(shortcut)) continue;
    return shortcut;
  }

  return null;
}

/** Display names for keys whose raw token reads badly in a UI. */
const KEY_LABELS = {
  enter: "Enter",
  arrowdown: "↓",
  arrowup: "↑",
  escape: "Esc",
  " ": "Space",
};

/**
 * Renders a combo as the sequence of key caps to display.
 *
 * @param {string} combo - The combo string.
 * @param {boolean} [isMac=false] - Use Mac glyphs.
 * @returns {string[]} Key cap labels, in display order.
 */
export function formatCombo(combo, isMac = false) {
  const parsed = parseCombo(combo);
  const caps = [];

  if (parsed.mod) caps.push(isMac ? "⌘" : "Ctrl");
  if (parsed.alt) caps.push(isMac ? "⌥" : "Alt");
  if (parsed.shift) caps.push(isMac ? "⇧" : "Shift");

  if (parsed.key) {
    const label = KEY_LABELS[parsed.key]
      ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
    caps.push(label);
  }

  return caps;
}

/**
 * Groups the registry for rendering a reference list.
 *
 * @param {Array<Object>} [shortcuts=SHORTCUTS] - Registry to group.
 * @returns {Array<{group: string, shortcuts: Array<Object>}>} Groups in
 *   first-seen order.
 */
export function groupShortcuts(shortcuts = SHORTCUTS) {
  const groups = [];
  const byName = new Map();

  for (const shortcut of shortcuts) {
    const name = shortcut.group || "Other";
    if (!byName.has(name)) {
      const group = { group: name, shortcuts: [] };
      byName.set(name, group);
      groups.push(group);
    }
    byName.get(name).shortcuts.push(shortcut);
  }

  return groups;
}
