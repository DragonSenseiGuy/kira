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

// The model addressing the reader about the list, not a suggestion.
const SIGN_OFF =
  /^(?:let me know|feel free|i hope|hope (?:this|these|that)|happy to|i can|i'm|i am|if you|tell me (?:which|what|if)\b.*\byou(?:['’]d| would| want|['’]re| are| need| prefer)|pick (?:one|any)|choose (?:one|any)|select (?:one|any)|just ask|ask me)\b/i;

const REQUEST_VERB =
  /^(?:please\s+)?(?:show|explain|tell|give|compare|write|summari[sz]e|list|describe|walk|help|create|make|draft|suggest|find|translate|rewrite|generate|provide|outline|break|share|add|convert|expand|elaborate|simplify|turn)\b/i;

/**
 * Whether an unnumbered line in a list reads as a suggestion the model
 * forgot to number: a question, a full sentence in any language, or an
 * English request however it ends. Headings and sign-offs are not.
 */
function isUnmarkedSuggestion(line) {
  if (/[?？]$/.test(line)) return true;
  if (SIGN_OFF.test(line) || /(?:[:：]|\.\.\.|…)$/.test(line)) return false;
  return /[.。]$/.test(line) || REQUEST_VERB.test(line);
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
 * Reads a reply that is a JSON array on its own or in a code fence.
 * @param {string} text
 * @returns {Array|null}
 */
function asJsonArray(body) {
  if (!body.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function wholeJsonArray(text) {
  const whole = asJsonArray(text.trim());
  if (whole) return whole;
  // A fenced array is the answer whatever is written around the fence.
  for (const fence of text.matchAll(/```[\w-]*[ \t]*\n([\s\S]*?)\n?```/g)) {
    const fenced = asJsonArray(fence[1].trim());
    if (fenced) return fenced;
  }
  return null;
}

/**
 * Extracts the suggestions from a model reply. In order: a JSON array that
 * is the whole reply or fenced, a numbered or bulleted list, a JSON array inside
 * prose, and finally one suggestion per line.
 * @param {string} text
 * @returns {string[]} At most MAX_FOLLOW_UPS distinct suggestions.
 */
export function parseFollowUps(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  let items = wholeJsonArray(text);
  if (!items) {
    const lines = text.split("\n").filter((line) => line.trim() && !/^\s*```/.test(line));
    const firstListed = lines.findIndex((line) => LIST_MARKER.test(line));
    if (lines.filter((line) => LIST_MARKER.test(line)).length >= 2) {
      // A list: headings and sign-offs around the items are not suggestions,
      // but a question the model forgot to number is.
      // Numbered items come first, so an unnumbered line only fills a slot
      // they leave free.
      const listed = lines.slice(firstListed);
      items = [
        ...listed.filter((line) => LIST_MARKER.test(line)),
        ...listed.filter((line) => !LIST_MARKER.test(line) && isUnmarkedSuggestion(clean(line))),
      ];
    } else {
      items = findJsonArray(text) || lines;
    }
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
