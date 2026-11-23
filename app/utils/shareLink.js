/**
 * @file shareLink.js
 * @description A share link carries a read-only copy of a conversation in
 * the URL fragment (`/shared#1.<data>`). Browsers never send the fragment to
 * a server, so nothing is uploaded or stored anywhere: whoever has the link
 * has the copy.
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { getMessagesForBranchPath } from "~/composables/branchManager";

const VERSION = "1";
/** Longest link Kira creates; longer ones get cut off by chat and mail apps. */
export const MAX_LINK_LENGTH = 16000;
/** Largest unpacked copy a link may hold, so a crafted link cannot exhaust memory. */
const MAX_UNPACKED_BYTES = 2_000_000;
/** Most turns a link may hold, so a crafted link cannot flood the page. */
const MAX_TURNS = 2000;
const MAX_TITLE_LENGTH = 200;

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Text of a turn as shown in chat: an assistant reply's text parts in order. */
function turnText(message) {
  const parts = Array.isArray(message.parts)
    ? message.parts.filter((part) => part?.type === "content" && typeof part.content === "string" && part.content.trim())
    : [];
  const text = parts.length
    ? parts.map((part) => part.content.trim()).join("\n\n")
    : typeof message.content === "string"
      ? message.content
      : "";
  return text.trim();
}

function cleanTitle(title) {
  return typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH) : "";
}

/**
 * The copy of a conversation that a share link holds: the title and the text
 * of the branch currently shown. Reasoning, tool results and attachments are
 * left out.
 * @param {{title?: string, messages?: Array, branchPath?: number[]}} conversation
 * @returns {{title: string, messages: {role: "user"|"assistant", text: string}[]}}
 */
export function shareSnapshot(conversation) {
  const visible = getMessagesForBranchPath(conversation?.messages || [], conversation?.branchPath || []);
  const messages = [];
  for (const message of visible) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = turnText(message);
    if (text) messages.push({ role: message.role, text });
  }
  return { title: cleanTitle(conversation?.title), messages };
}

/**
 * Packs a snapshot into the fragment of a share link (without the `#`).
 * @returns {string}
 */
export function encodeShare(snapshot) {
  const compact = { t: snapshot.title, m: snapshot.messages.map((message) => [message.role === "user" ? "u" : "a", message.text]) };
  return `${VERSION}.${toBase64Url(deflateSync(strToU8(JSON.stringify(compact)), { level: 9 }))}`;
}

/**
 * Reads the fragment of a share link. Links are untrusted input: anything
 * that is not exactly a snapshot is rejected.
 * @param {string} fragment - With or without the leading `#`.
 * @returns {{title: string, messages: {role: "user"|"assistant", text: string}[]} | null}
 */
export function decodeShare(fragment) {
  const match = /^#?1\.([A-Za-z0-9_-]+)$/.exec(typeof fragment === "string" ? fragment : "");
  if (!match) return null;
  let data;
  try {
    const bytes = inflateSync(fromBase64Url(match[1]), { out: new Uint8Array(MAX_UNPACKED_BYTES) });
    data = JSON.parse(strFromU8(bytes));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.m) || data.m.length > MAX_TURNS) return null;
  const messages = [];
  for (const entry of data.m) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [role, text] = entry;
    if ((role !== "u" && role !== "a") || typeof text !== "string") return null;
    messages.push({ role: role === "u" ? "user" : "assistant", text });
  }
  if (messages.length === 0) return null;
  return { title: cleanTitle(data.t), messages };
}

/**
 * Builds the share link of a conversation.
 * @param {Object} conversation - As returned by loadConversation().
 * @param {string} origin - For example `window.location.origin`.
 * @returns {{ok: true, url: string} | {ok: false, reason: "empty" | "too-long"}}
 */
export function buildShareLink(conversation, origin) {
  const snapshot = shareSnapshot(conversation);
  if (snapshot.messages.length === 0) return { ok: false, reason: "empty" };
  const fragment = encodeShare(snapshot);
  const url = `${origin}/shared#${fragment}`;
  // Repetitive text can fit the link length yet exceed what a reader unpacks.
  if (url.length > MAX_LINK_LENGTH || !decodeShare(fragment)) return { ok: false, reason: "too-long" };
  return { ok: true, url };
}
