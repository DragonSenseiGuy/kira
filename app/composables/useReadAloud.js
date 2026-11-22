/**
 * @file useReadAloud.js
 * @description Reads assistant messages aloud with the browser's
 * speechSynthesis. Everything happens on the device; no audio or text is
 * sent to Kira's server.
 */

import { ref, getCurrentScope, onScopeDispose } from "vue";

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
export function speechTextFromMarkdown(markdown) {
  if (typeof markdown !== "string" || !markdown) return "";

  const text = markdown
    .replace(/(```|~~~)[\s\S]*?(\1|$)/g, "\n")
    .replace(/\$\$[\s\S]*?\$\$/g, "\n")
    .replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, " ")
    .replace(/\$(?=\S)[^$\n]*?(?<=\S)\$/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/gm, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(>\s?)+/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\*+|~~|`+|\b__|__\b/g, "");

  return text
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
