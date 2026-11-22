/**
 * @file useReadAloud.js
 * @description Reads assistant messages aloud with the browser's
 * speechSynthesis. Everything happens on the device; no audio or text is
 * sent to Kira's server.
 */

import { ref, getCurrentScope, onScopeDispose } from "vue";
import { md } from "../utils/markdown";

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
/** Speakable text of one inline token: its words and code spans only. */
function inlineSpeech(children) {
  let text = "";
  let autolink = false;
  for (const child of children || []) {
    if (child.type === "link_open") {
      // A bare URL is skipped, but a bare email address is worth hearing.
      const auto = child.markup === "linkify" || child.markup === "autolink";
      autolink = auto && !/^mailto:/i.test(child.attrGet("href") || "");
    }
    else if (child.type === "link_close") autolink = false;
    else if (autolink) continue;
    else if (child.type === "text" || child.type === "code_inline") text += child.content;
    // The description is parsed too, so math inside it stays unspoken.
    else if (child.type === "image") text += child.children ? inlineSpeech(child.children) : child.content;
    else if (child.type === "softbreak" || child.type === "hardbreak") text += "\n";
    // Everything else (math, HTML tags, footnote references) is not spoken.
  }
  return text;
}

const HTML_SILENT = "script, style, template, pre, code, svg, math, head, noscript, iframe, object, textarea, select";
const HTML_LINE_ENDS = "p, div, li, tr, br, h1, h2, h3, h4, h5, h6, blockquote, section, article, summary, details, dt, dd, caption, figcaption, hr";

/**
 * Visible prose of a raw HTML block. The markup is parsed into a detached
 * document, so nothing in it loads or runs.
 */
function htmlBlockSpeech(html) {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.body) return "";
  doc.body.querySelectorAll(HTML_SILENT).forEach((el) => el.remove());
  doc.body.querySelectorAll("td, th").forEach((el) => el.append(" "));
  doc.body.querySelectorAll(HTML_LINE_ENDS).forEach((el) => el.append("\n"));
  return doc.body.textContent || "";
}

export function speechTextFromMarkdown(markdown) {
  if (typeof markdown !== "string" || !markdown) return "";

  const lines = [];
  let row = null;
  // The chat's own parser decides what is code, math or markup, so speech
  // matches what is displayed. Only inline text is spoken: fences, indented
  // code and math blocks are other token types. HTML blocks contribute
  // their visible text.
  for (const token of md.parse(markdown, {})) {
    if (token.type === "tr_open") row = [];
    else if (token.type === "tr_close") {
      lines.push(row.join(" "));
      row = null;
    } else if (token.type === "html_block") {
      lines.push(htmlBlockSpeech(token.content));
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
