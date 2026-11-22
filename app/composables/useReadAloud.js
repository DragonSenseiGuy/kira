/**
 * @file useReadAloud.js
 * @description Reads assistant messages aloud with the browser's
 * speechSynthesis. Everything happens on the device; no audio or text is
 * sent to Kira's server.
 */

import { ref, getCurrentScope, onScopeDispose } from "vue";
import MarkdownIt from "markdown-it";

/**
 * Chrome silently stops speaking utterances that run longer than roughly
 * fifteen seconds, so text is queued as short utterances instead.
 */
const MAX_UTTERANCE_LENGTH = 220;

/**
 * Turns Markdown into prose worth speaking: no syntax, no code blocks, no
 * LaTeX, no URLs.
 *
 * @param {string} markdown
 * @returns {string}
 */
const speechMarkdown = new MarkdownIt({ html: false, linkify: false });

// Stand-ins for the escapes Markdown would otherwise turn into plain
// characters, so "\$5" (a price) can be told apart from "$x$" (math).
const ESCAPES = { "\\$": "\uE000", "\\(": "\uE001", "\\)": "\uE002", "\\[": "\uE003", "\\]": "\uE004" };
const ESCAPED_CHARS = { "\uE000": "$", "\uE001": "(", "\uE002": ")", "\uE003": "[", "\uE004": "]" };
const restoreEscapes = (text) => text.replace(/[\uE000-\uE004]/g, (c) => ESCAPED_CHARS[c]);

/** Speakable text of one inline token: no math, no tags, code spans kept. */
function inlineSpeech(children) {
  const codeSpans = [];
  let text = "";
  for (const child of children || []) {
    if (child.type === "text") text += child.content.replace(/<\/?[a-zA-Z][^>]*>/g, "");
    else if (child.type === "code_inline") {
      codeSpans.push(restoreEscapes(child.content));
      text += `\uE010${codeSpans.length - 1}\uE011`;
    } else if (child.type === "image") text += child.content;
    else if (child.type === "softbreak" || child.type === "hardbreak") text += "\n";
  }
  text = text
    .replace(/\$\$[\s\S]*?\$\$/g, "\n")
    .replace(/\uE003[\s\S]*?\uE004|\uE001[\s\S]*?\uE002/g, " ")
    .replace(/\$(?=\S)[^$\n]*?(?<=\S)\$/g, " ");
  return restoreEscapes(text).replace(/\uE010(\d+)\uE011/g, (_, n) => codeSpans[Number(n)]);
}

export function speechTextFromMarkdown(markdown) {
  if (typeof markdown !== "string" || !markdown) return "";

  const source = markdown.replace(/\\[$()[\]]/g, (escape) => ESCAPES[escape]);
  const lines = [];
  let row = null;
  // Fences, indented code and HTML blocks are separate token types and are
  // skipped, wherever they are nested (quotes, list items).
  for (const token of speechMarkdown.parse(source, {})) {
    if (token.type === "tr_open") row = [];
    else if (token.type === "tr_close") {
      lines.push(row.join(" "));
      row = null;
    } else if (token.type === "inline") {
      const text = inlineSpeech(token.children);
      if (row) row.push(text);
      else lines.push(text);
    }
  }

  return lines
    .join("\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Splits text into utterance-sized chunks, preferring sentence boundaries
 * and falling back to word boundaries for over-long sentences.
 *
 * @param {string} text
 * @param {number} [maxLength]
 * @returns {string[]}
 */
export function chunkSpeechText(text, maxLength = MAX_UTTERANCE_LENGTH) {
  const chunks = [];
  let current = "";

  const push = (piece) => {
    if (!current) {
      current = piece;
    } else if (current.length + 1 + piece.length <= maxLength) {
      current += ` ${piece}`;
    } else {
      chunks.push(current);
      current = piece;
    }
  };

  const sentences = String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    if (sentence.length <= maxLength) {
      push(sentence);
      continue;
    }
    for (const word of sentence.split(/\s+/)) {
      for (let i = 0; i < word.length; i += maxLength) {
        push(word.slice(i, i + maxLength));
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * @param {Object} [options]
 * @param {Object} [options.win]  Window-like object (injectable for tests).
 * @returns {{
 *   supported: boolean,
 *   speakingId: import("vue").Ref<string|null>,
 *   toggle: (id: string, markdown: string) => void,
 *   stop: () => void,
 * }}
 */
export function useReadAloud({ win = globalThis } = {}) {
  const synth = win?.speechSynthesis;
  const Utterance = win?.SpeechSynthesisUtterance;
  const supported = !!(synth && Utterance);

  const speakingId = ref(null);
  // Identifies the current playback so callbacks from cancelled
  // utterances (which fire late) cannot touch the one now playing.
  let playback = 0;
  let queued = [];

  function stop() {
    if (!supported) return;
    playback++;
    queued = [];
    synth.cancel();
    speakingId.value = null;
  }

  function toggle(id, markdown) {
    if (!supported) return;

    const wasPlaying = speakingId.value;
    if (wasPlaying !== null) stop();
    if (wasPlaying === id) return;

    const chunks = chunkSpeechText(speechTextFromMarkdown(markdown));
    if (chunks.length === 0) return;

    const current = ++playback;
    let remaining = chunks.length;

    speakingId.value = id;
    // Held until playback ends: Chrome drops the callbacks of utterances
    // that get garbage-collected while still queued.
    queued = chunks.map((chunk) => {
      const utterance = new Utterance(chunk);
      utterance.onend = () => {
        if (playback !== current) return;
        if (--remaining === 0) {
          speakingId.value = null;
          queued = [];
        }
      };
      utterance.onerror = () => {
        if (playback !== current) return;
        stop();
      };
      return utterance;
    });
    for (const utterance of queued) synth.speak(utterance);
  }

  if (supported && getCurrentScope()) {
    onScopeDispose(stop);
  }

  return { supported, speakingId, toggle, stop };
}
