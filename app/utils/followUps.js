/**
 * @file followUps.js
 * @description Prompt building and reply parsing for follow-up suggestions.
 */

export const MAX_FOLLOW_UPS = 3;
const MAX_SUGGESTION_LENGTH = 120;
const MAX_TURN_CHARS = 2000;
const RECENT_TURNS = 4;

export const FOLLOW_UP_SYSTEM_PROMPT =
  `You suggest follow-up questions. Given the end of a conversation between a user and an AI assistant, ` +
  `propose ${MAX_FOLLOW_UPS} short questions or requests the user might send next. ` +
  `Write them from the user's point of view, in the language of the conversation, each under 80 characters. ` +
  `Output only a JSON array of ${MAX_FOLLOW_UPS} strings, with no other text.`;

/**
 * Builds the request messages from the last few visible turns.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Array<{role: string, content: string}>}
 */
export function buildFollowUpMessages(messages) {
  const transcript = (messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-RECENT_TURNS)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim().slice(0, MAX_TURN_CHARS)}`)
    .join("\n\n");
  return [
    { role: "system", content: FOLLOW_UP_SYSTEM_PROMPT },
    { role: "user", content: `Conversation so far:\n\n${transcript}` },
  ];
}

function clean(item) {
  if (typeof item !== "string") return "";
  return item
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/^["'“”]+|["'“”,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Finds the first JSON array of strings in a reply, ignoring brackets in
 * any prose around it.
 * @param {string} text
 * @returns {string[]|null}
 */
function findJsonArray(text) {
  for (let start = text.indexOf("["); start !== -1; start = text.indexOf("[", start + 1)) {
    for (let end = text.lastIndexOf("]"); end > start; end = text.lastIndexOf("]", end - 1)) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed) && parsed.some((item) => typeof item === "string")) return parsed;
      } catch {
        // Not JSON at this span; try a shorter one.
      }
    }
  }
  return null;
}

/**
 * Extracts the suggestions from a model reply: a JSON array when there is
 * one (optionally inside a code fence or surrounded by prose), otherwise
 * one suggestion per line.
 * @param {string} text
 * @returns {string[]} At most MAX_FOLLOW_UPS distinct suggestions.
 */
export function parseFollowUps(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  let items = findJsonArray(text);
  if (!items) {
    const lines = text.split("\n").filter((line) => line.trim() && !/^\s*```/.test(line));
    // When the reply is a list, an introduction above it is not a suggestion.
    const listed = lines.filter((line) => LIST_MARKER.test(line));
    items = listed.length >= 2 ? listed : lines;
  }

  const seen = new Set();
  const result = [];
  for (const item of items) {
    const suggestion = clean(item);
    if (!suggestion || suggestion.length > MAX_SUGGESTION_LENGTH) continue;
    const key = suggestion.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length === MAX_FOLLOW_UPS) break;
  }
  return result;
}
