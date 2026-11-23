/**
 * @file useDictation.js
 * @description Voice dictation into a text field through the browser's
 * Web Speech API (SpeechRecognition). Audio is handled by the browser's
 * own speech service; nothing is sent to Kira's server.
 *
 * Not every browser ships the API (Firefox does not), so callers must
 * check `supported` and hide the control otherwise.
 */

import { ref, getCurrentScope, onScopeDispose } from "vue";

/**
 * @param {Object} [win]  Window-like object to probe.
 * @returns {Function|null} The SpeechRecognition constructor, if any.
 */
export function getSpeechRecognition(win = globalThis) {
  return win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
}

/**
 * Appends a transcript to already-typed text with sensible spacing.
 *
 * @param {string} base  Text already in the field.
 * @param {string} transcript  Dictated text.
 * @returns {string}
 */
export function mergeDictation(base, transcript) {
  const spoken = (transcript || "").trim();
  if (!spoken) return base;
  if (!base) return spoken;
  if (/\n$/.test(base)) return base + spoken;
  return `${base.replace(/[ \t]+$/, "")} ${spoken}`;
}

/**
 * Maps a SpeechRecognitionErrorEvent code to a message worth showing.
 * Returns "" for codes that need no explanation.
 *
 * @param {string} code
 * @returns {string}
 */
export function dictationErrorMessage(code) {
  switch (code) {
    case "aborted":
    case "no-speech":
      return "";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser to dictate.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Dictation needs a network connection in this browser.";
    default:
      return "Dictation stopped unexpectedly.";
  }
}

/**
 * Removes the last occurrence of an unfinished phrase from the field text.
 *
 * @param {string} text
 * @param {string} interim
 * @returns {string}
 */
function withoutInterim(text, interim) {
  if (!interim) return text;
  const at = text.lastIndexOf(interim);
  if (at === -1) return text;
  const before = text.slice(0, at);
  const after = text.slice(at + interim.length);
  return after.trim() ? before + after.replace(/^\s+/, "") : before.replace(/[ \t]+$/, "");
}

/**
 * @param {Object} options
 * @param {() => string} options.getText  Reads the field's current text.
 * @param {(text: string) => void} options.setText  Writes the field's text.
 * @param {Object} [options.win]  Window-like object (injectable for tests).
 * @returns {{
 *   supported: boolean,
 *   listening: import("vue").Ref<boolean>,
 *   error: import("vue").Ref<string>,
 *   start: () => void, stop: () => void, cancel: () => void, toggle: () => void,
 * }}
 */
export function useDictation({ getText, setText, win = globalThis }) {
  const Recognition = getSpeechRecognition(win);
  const listening = ref(false);
  const error = ref("");

  let recognition = null;

  function start() {
    if (!Recognition || recognition) return;
    error.value = "";

    const session = new Recognition();
    session.continuous = true;
    session.interimResults = true;
    session.lang = win?.navigator?.language || "en-US";

    // Text the session builds on, the index of the first result that is
    // not yet part of it, and what we last wrote (to detect manual edits).
    let base = getText() || "";
    let firstIndex = 0;
    let lastWritten = base;
    let lastInterim = "";

    session.onstart = () => {
      if (recognition === session) listening.value = true;
    };

    session.onresult = (event) => {
      if (recognition !== session) return;

      const current = getText() || "";
      if (current !== lastWritten) {
        // The user edited the field: keep their text. An unfinished
        // phrase still in it is about to be reported again (revised), so
        // take it out rather than append its revision after it.
        base = withoutInterim(current, lastInterim);
      }

      let committed = base;
      let interim = "";
      let nextIndex = firstIndex;
      for (let i = firstIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal && !interim) {
          committed = mergeDictation(committed, transcript);
          nextIndex = i + 1;
        } else {
          interim += transcript;
        }
      }
      base = committed;
      firstIndex = nextIndex;

      lastInterim = interim.trim();
      lastWritten = mergeDictation(committed, interim);
      setText(lastWritten);
    };

    session.onerror = (event) => {
      if (recognition !== session) return;
      error.value = dictationErrorMessage(event?.error);
    };

    session.onend = () => {
      if (recognition !== session) return;
      recognition = null;
      listening.value = false;
    };

    recognition = session;
    try {
      session.start();
      listening.value = true;
    } catch {
      recognition = null;
      listening.value = false;
      error.value = dictationErrorMessage("start-failed");
    }
  }

  /** Stops gracefully: the browser still delivers the pending result. */
  function stop() {
    recognition?.stop();
  }

  /**
   * Stops at once and ignores anything the browser reports afterwards.
   * Used when the text is sent, so a late result cannot land in the
   * emptied field.
   */
  function cancel() {
    const session = recognition;
    if (!session) return;
    recognition = null;
    listening.value = false;
    session.abort();
  }

  function toggle() {
    if (recognition) stop();
    else start();
  }

  if (getCurrentScope()) onScopeDispose(cancel);

  return { supported: !!Recognition, listening, error, start, stop, cancel, toggle };
}
