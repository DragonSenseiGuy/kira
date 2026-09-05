/**
 * @file keybinds.js
 * @description Pure helpers for user-customizable keyboard shortcuts.
 *
 * Storage format (canonical): lowercase `+`-joined tokens, modifiers
 * first in fixed order (mod, ctrl, meta, alt, shift), key last.
 *   "mod+alt+n", "/", "mod+shift+k"
 * `mod` means Meta on Apple platforms, Ctrl elsewhere — resolved at
 * match time so stored binds stay platform-independent.
 */

export const KEYBIND_ACTIONS = [
  { id: 'open_palette', label: 'Open command palette', default: 'mod+k' },
  { id: 'focus_input', label: 'Focus text input', default: '/' },
  { id: 'new_chat', label: 'New chat', default: 'mod+alt+n' },
  { id: 'toggle_sidebar', label: 'Toggle main sidebar', default: 'mod+b' },
  { id: 'toggle_parameters', label: 'Toggle model parameters', default: 'mod+alt+b' },
  { id: 'toggle_incognito', label: 'Toggle incognito mode', default: 'mod+alt+i' },
];

/** Ordered modifier tokens (canonical ordering). */
const MODIFIER_ORDER = ['mod', 'ctrl', 'meta', 'alt', 'shift'];
const MODIFIER_SET = new Set(MODIFIER_ORDER);

const ALIASES = {
  control: 'ctrl',
  cmd: 'mod',
  command: 'mod',
  meta: 'meta',
  option: 'alt',
  esc: 'escape',
  del: 'delete',
  return: 'enter',
  space: 'space',
  spacebar: 'space',
  plus: '+',
};

/**
 * Normalizes a combo string into canonical form.
 * Returns null when the combo has no non-modifier key.
 *
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeCombo(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => ALIASES[p] ?? p);

  const mods = [];
  let key = null;
  for (const part of parts) {
    if (MODIFIER_SET.has(part)) {
      if (!mods.includes(part)) mods.push(part);
    } else {
      // Last non-modifier wins (defensive against junk input).
      key = part;
    }
  }
  if (!key) return null;

  const orderedMods = MODIFIER_ORDER.filter((m) => mods.includes(m));
  return [...orderedMods, key].join('+');
}

/**
 * Formats a canonical combo for display.
 * @param {string} combo  Canonical combo (from normalizeCombo).
 * @param {boolean} isMac
 * @returns {string[]}
 */
export function formatComboParts(combo, isMac) {
  const normalized = normalizeCombo(combo);
  if (!normalized) return [];
  return normalized.split('+').map((token) => {
    switch (token) {
      case 'mod': return isMac ? '⌘' : 'Ctrl';
      case 'ctrl': return isMac ? '⌃' : 'Ctrl';
      case 'meta': return 'Meta';
      case 'alt': return isMac ? '⌥' : 'Alt';
      case 'shift': return isMac ? '⇧' : 'Shift';
      case 'space': return 'Space';
      case 'escape': return 'Esc';
      case 'arrowup': return '↑';
      case 'arrowdown': return '↓';
      case 'arrowleft': return '←';
      case 'arrowright': return '→';
      default:
        return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
    }
  });
}

/**
 * Converts a KeyboardEvent into a canonical combo string.
 * Returns null when no non-modifier key is held.
 *
 * @param {KeyboardEvent} e
 * @param {boolean} isMac
 * @returns {string|null}
 */
export function eventToCombo(e, isMac) {
  const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (!key || ['control', 'meta', 'altgraph', 'shift'].includes(key)) return null;
  if (key === 'alt' && !e.getModifierState?.('AltGraph')) return null;

  // Collect modifiers, then emit in canonical order.
  const mods = new Set();
  if (e.metaKey) mods.add(isMac ? 'mod' : 'meta');
  if (e.ctrlKey) mods.add(isMac ? 'ctrl' : 'mod');
  if (e.altKey) mods.add('alt');
  if (e.shiftKey) mods.add('shift');

  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m));
  const keyToken = ALIASES[key] ?? key;
  return [...ordered, keyToken].join('+');
}

/**
 * Detects combos the browser reserves (the page can listen, but Chrome/
 * Firefox will act first anyway). Returns a human-readable reason or null.
 *
 * @param {string} combo  Canonical combo.
 * @returns {string|null}
 */
export function reservedComboWarning(combo) {
  const normalized = normalizeCombo(combo);
  if (!normalized) return null;
  const parts = normalized.split('+');
  const key = parts[parts.length - 1];
  const others = parts.slice(0, -1); // modifiers present

  // Exactly Ctrl/⌘ + letter: tab & window management is off-limits.
  if (others.length === 1 && others[0] === 'mod' && ['t', 'w', 'n'].includes(key)) {
    return 'Browsers reserve this combination for tab/window management — it cannot be intercepted.';
  }
  // ⌘/Ctrl+Shift+… reopen-tab / new-window / quit.
  if (others.length === 2 && others.includes('mod') && others.includes('shift') && ['t', 'n', 'q'].includes(key)) {
    return 'Browsers reserve this combination (reopen tab / new window / quit).';
  }
  if (others.length === 1 && others[0] === 'mod' && key === 'l') {
    return 'Browsers reserve Ctrl/⌘+L for the address bar.';
  }
  return null;
}

/**
 * True when the event originates from a text-entry surface — modifier-less
 * binds (like "/") must not hijack typing.
 * @param {EventTarget} target
 * @returns {boolean}
 */
export function isTextEntryTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable === true
  );
}
