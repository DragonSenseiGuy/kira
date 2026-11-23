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

const HTML_SILENT = "[hidden], script, style, template, pre, svg, math, head, noscript, iframe, object, textarea, select";
const HTML_LINE_ENDS = "p, div, li, tr, br, h1, h2, h3, h4, h5, h6, blockquote, section, article, summary, details, dt, dd, caption, figcaption, hr";

// A web address in running text. It ends at whitespace or full-width
// punctuation, and is not the domain part of an email address.
const URL_END = "\\s<>\"'\ue000\u3000-\u3002\uff01\uff0c\uff1a\uff1b\uff1f";
const BARE_URL = new RegExp(`(?<![\\w@.\\-/])(?:https?:\\/\\/|www\\.)[^${URL_END}]*[^${URL_END}.,;:!?)\\]]`, "gi");
const WIDE_BRACKETS = { "〈": "〉", "《": "》", "「": "」", "『": "』", "【": "】", "〔": "〕", "〖": "〗", "〘": "〙", "〚": "〛", "（": "）", "［": "］", "｛": "｝" };
const WIDE_CLOSERS = new Set(Object.values(WIDE_BRACKETS));

/**
 * Length of the address at the start of a bare-URL match. A full-width
 * bracket pair inside the path belongs to the address. The address ends
 * before a closing bracket with no opener in it, before an opener that is
 * never closed, and before any bracket that follows the host directly:
 * those are the prose around the address.
 */
function addressLength(match, rest) {
  const pathStart = match.replace(/^https?:\/\//i, (scheme) => " ".repeat(scheme.length)).search(/[/?#]/);
  const open = [];
  for (let i = 0; i < match.length; i++) {
    const char = match[i];
    if (WIDE_BRACKETS[char]) {
      if (pathStart < 0 || i < pathStart) return i;
      open.push({ closer: WIDE_BRACKETS[char], at: i });
    } else if (WIDE_CLOSERS.has(char) && open.pop()?.closer !== char) {
      return i;
    }
  }
  if (!open.length) return match.length;
  // An opener left open starts a note when the match stopped at something
  // other than a space, or when the note closes later in the sentence
  // ("（PDF 版）"). Otherwise it is a literal character of the address.
  const spaced = rest === "" || /^\s/.test(rest);
  if (!spaced) return open[0].at;
  // Brackets that open later in the sentence close before this one does.
  let depth = 0;
  for (const char of rest.split(/[。.!?！？\n]/, 1)[0]) {
    if (WIDE_BRACKETS[char]) depth++;
    else if (WIDE_CLOSERS.has(char) && depth-- === 0) return char === open[0].closer ? open[0].at : match.length;
  }
  return match.length;
}

/** Removes bare web addresses, keeping the prose and brackets around them. */
function stripBareUrls(text) {
  const pattern = new RegExp(BARE_URL.source, BARE_URL.flags);
  let out = "";
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text))) {
    out += text.slice(cursor, match.index);
    cursor = match.index + addressLength(match[0], text.slice(match.index + match[0].length));
    pattern.lastIndex = cursor;
  }
  return out + text.slice(cursor);
}

// Elements whose content the browser shows or keeps as text, not markup.
const RAW_TEXT_ELEMENT = /<(textarea|title|script|style|xmp|noscript|iframe)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;

/**
 * Number of disclosures a line's inline HTML puts on screen. A tag shown
 * as literal text (inside a `<textarea>`, say) is not one.
 */
function inlineDetailsCount(children) {
  const html = (children || [])
    .map((child) => (child.type === "html_inline" ? child.content : ""))
    .join("")
    .replace(RAW_TEXT_ELEMENT, "");
  if (!/<details[\s>]/i.test(html) || typeof DOMParser === "undefined") return 0;
  return new DOMParser().parseFromString(html, "text/html").body?.querySelectorAll("details").length || 0;
}

/**
 * Visible prose of a raw HTML block. The markup is parsed into a detached
 * document, so nothing in it loads or runs.
 * @param {string} html
 * @param {() => boolean|undefined} nextDetailsState Returns whether the next
 *   `<details>` is expanded on screen, or undefined to use its attribute.
 */
function htmlBlockSpeech(html, nextDetailsState) {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.body) return "";
  // A closed disclosure shows only its summary.
  const closed = Array.from(doc.body.querySelectorAll("details")).filter(
    (details) => !(nextDetailsState() ?? details.hasAttribute("open")),
  );
  doc.body.querySelectorAll(HTML_SILENT).forEach((el) => el.replaceWith(el.tagName === "PRE" ? "\n" : ""));
  closed.forEach((details) => {
    const summary = Array.from(details.children).find((el) => el.tagName === "SUMMARY");
    details.replaceChildren(...(summary ? [summary] : []));
  });
  doc.body.querySelectorAll("td, th").forEach((el) => el.append(" "));
  doc.body.querySelectorAll(HTML_LINE_ENDS).forEach((el) => {
    el.before("\n");
    el.append("\n");
  });
  // Link labels are set aside so they are kept even when they look like an
  // address; see the address removal below.
  const labels = [];
  doc.body.querySelectorAll("a").forEach((a) => {
    labels.push(a.textContent);
    a.replaceWith(`\ue000${labels.length - 1}\ue001`);
  });
  // Bare web addresses are skipped, as they are in Markdown text. Matching
  // the joined text catches an address split by inline formatting.
  return stripBareUrls(doc.body.textContent || "")
    .replace(/\ue000(\d+)\ue001/g, (_, index) => labels[Number(index)]);
}

/**
 * @param {string} markdown
 * @param {{detailsOpen?: boolean[]}} [options] `detailsOpen` gives the
 *   on-screen state of each `<details>` in the message, in document order.
 */
export function speechTextFromMarkdown(markdown, options = {}) {
  if (typeof markdown !== "string" || !markdown) return "";

  const lines = [];
  let row = null;
  let detailsIndex = 0;
  const nextDetailsState = () => options.detailsOpen?.[detailsIndex++];
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
      lines.push(htmlBlockSpeech(token.content, nextDetailsState));
    } else if (token.type === "inline") {
      // A disclosure written inline (in a table cell, say) is on screen too,
      // so it takes its place in the list of on-screen states.
      detailsIndex += inlineDetailsCount(token.children);
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

  function toggle(id, markdown, options) {
    if (!supported) return;

    const wasPlaying = speakingId.value;
    if (wasPlaying !== null) stop();
    if (wasPlaying === id) return;

    const chunks = chunkSpeechText(speechTextFromMarkdown(markdown, options));
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
