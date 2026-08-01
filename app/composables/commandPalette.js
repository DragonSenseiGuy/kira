/**
 * @file commandPalette.js
 * @description Pure logic behind the ⌘K command palette.
 *
 * The component only renders what these functions produce, so the ordering,
 * sectioning, prefix modes, and keyboard-navigation rules are all testable
 * without mounting anything.
 */

import { fuzzyFilter } from "~/utils/fuzzyMatch";

/**
 * Prefix characters that narrow the palette to a single section.
 * @type {Record<string, string>}
 */
export const PALETTE_PREFIXES = {
  ">": "commands",
  "@": "chats",
  "#": "messages",
};

/**
 * Splits a raw palette input into a mode and a search term.
 *
 * @param {string} raw - The raw input value.
 * @returns {{mode: 'all'|'commands'|'chats'|'messages', term: string}}
 */
export function parsePaletteQuery(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return { mode: "all", term: "" };
  }

  const prefix = PALETTE_PREFIXES[raw[0]];
  if (prefix) {
    return { mode: prefix, term: raw.slice(1).trim() };
  }

  return { mode: "all", term: raw.trim() };
}

/**
 * How many rows each section may contribute.
 *
 * With no term typed we show a short "landing" list; a prefix mode devotes the
 * whole list to one section. Message search needs a term, so it stays empty
 * until one is typed.
 *
 * @param {string} mode - The parsed mode.
 * @param {boolean} hasTerm - Whether a search term was typed.
 * @returns {{commands: number, chats: number, messages: number}}
 */
function sectionLimits(mode, hasTerm) {
  if (mode === "commands") return { commands: 40, chats: 0, messages: 0 };
  if (mode === "chats") return { commands: 0, chats: 40, messages: 0 };
  if (mode === "messages") return { commands: 0, chats: 0, messages: hasTerm ? 40 : 0 };
  if (!hasTerm) return { commands: 7, chats: 5, messages: 0 };
  return { commands: 5, chats: 5, messages: 8 };
}

/**
 * Builds the sectioned, flattened row list the palette renders.
 *
 * @param {Object} input
 * @param {Array<Object>} [input.commands] - `{ id, label, hint, icon, keywords, run }`.
 * @param {Array<Object>} [input.conversations] - Conversation metadata records.
 * @param {Array<Object>} [input.messageResults] - Results from `searchConversations`.
 * @param {string} [input.query] - The raw input value (prefix included).
 * @returns {{mode: string, term: string, sections: Array<Object>, flat: Array<Object>}}
 *   `flat` is the keyboard-navigation order; each row carries its section.
 */
export function buildPaletteItems(input = {}) {
  const {
    commands = [],
    conversations = [],
    messageResults = [],
    query = "",
  } = input;

  const { mode, term } = parsePaletteQuery(query);
  const limits = sectionLimits(mode, term.length > 0);

  const sections = [];

  if (limits.commands > 0) {
    // Matching against label + keywords lets "dark"/"theme" both find the
    // theme toggle without bloating the visible label.
    const matches = fuzzyFilter(commands, term, {
      key: (command) => [command.label, ...(command.keywords || [])].join(" "),
      limit: limits.commands,
    });

    if (matches.length > 0) {
      sections.push({
        key: "commands",
        label: "Commands",
        items: matches.map(({ item, positions }) => ({
          kind: "command",
          key: `command:${item.id}`,
          command: item,
          // Positions were computed against label + keywords, so only the ones
          // landing inside the label itself can be highlighted.
          positions: positions.filter((p) => p < (item.label?.length ?? 0)),
        })),
      });
    }
  }

  if (limits.chats > 0) {
    const matches = fuzzyFilter(conversations, term, {
      key: (conversation) => conversation.title || "Untitled",
      limit: limits.chats,
    });

    if (matches.length > 0) {
      sections.push({
        key: "chats",
        label: term ? "Chats" : "Recent chats",
        items: matches.map(({ item, positions }) => ({
          kind: "chat",
          key: `chat:${item.id}`,
          conversation: item,
          positions,
        })),
      });
    }
  }

  if (limits.messages > 0 && messageResults.length > 0) {
    sections.push({
      key: "messages",
      label: "In messages",
      items: messageResults.slice(0, limits.messages).map((result) => ({
        kind: "message",
        key: `message:${result.conversationId}:${result.messageId}`,
        result,
      })),
    });
  }

  const flat = [];
  for (const section of sections) {
    for (const item of section.items) {
      flat.push({ ...item, sectionKey: section.key, index: flat.length });
    }
  }

  return { mode, term, sections, flat };
}

/**
 * Moves the keyboard selection, wrapping at both ends.
 *
 * @param {number} current - The current index.
 * @param {number} delta - +1 for down, -1 for up.
 * @param {number} length - Number of selectable rows.
 * @returns {number} The new index, or -1 when there is nothing to select.
 */
export function moveActiveIndex(current, delta, length) {
  if (!length || length <= 0) return -1;
  const start = Number.isInteger(current) && current >= 0 ? current : delta > 0 ? -1 : 0;
  return (((start + delta) % length) + length) % length;
}

/**
 * Keeps a selection valid after the row list changes underneath it.
 *
 * @param {number} current - The previous index.
 * @param {number} length - The new row count.
 * @returns {number} A valid index, or -1 when there are no rows.
 */
export function clampActiveIndex(current, length) {
  if (!length || length <= 0) return -1;
  if (!Number.isInteger(current) || current < 0) return 0;
  return Math.min(current, length - 1);
}
