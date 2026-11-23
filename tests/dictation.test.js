/**
 * Tests for app/composables/useDictation.js — voice dictation into the
 * composer via the browser's Web Speech API.
 *
 * The recognizer is faked; these pin down what the composer relies on:
 *   - feature detection (standard + webkit-prefixed, absent)
 *   - dictated text is appended to what was already typed
 *   - interim results are replaced, never duplicated
 *   - edits made by hand mid-dictation are preserved
 *   - errors and end-of-session reset the listening state
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getSpeechRecognition,
  mergeDictation,
  dictationErrorMessage,
  useDictation,
} from "../app/composables/useDictation.js";

let instances;

class FakeRecognition {
  constructor() {
    this.started = 0;
    this.stopped = 0;
    this.aborted = 0;
    instances.push(this);
  }
  start() {
    this.started++;
    this.onstart?.();
  }
  stop() {
    this.stopped++;
    this.onend?.();
  }
  abort() {
    this.aborted++;
    this.onend?.();
  }
  /** Emits a result event. `entries` is the FULL session list of [text, isFinal]. */
  emit(entries, resultIndex = 0) {
    const results = entries.map(([transcript, isFinal]) => {
      const result = [{ transcript }];
      result.isFinal = isFinal;
      return result;
    });
    this.onresult?.({ resultIndex, results });
  }
}

function setup(initial = "", win = { SpeechRecognition: FakeRecognition, navigator: { language: "en-GB" } }) {
  let text = initial;
  const dictation = useDictation({
    getText: () => text,
    setText: (value) => {
      text = value;
    },
    win,
  });
  return {
    dictation,
    get text() {
      return text;
    },
    set text(value) {
      text = value;
    },
    get rec() {
      return instances[instances.length - 1];
    },
  };
}

beforeEach(() => {
  instances = [];
});

describe("getSpeechRecognition", () => {
  it("prefers the standard constructor", () => {
    class Std {}
    class Webkit {}
    expect(getSpeechRecognition({ SpeechRecognition: Std, webkitSpeechRecognition: Webkit })).toBe(Std);
  });

  it("falls back to the webkit-prefixed constructor", () => {
    class Webkit {}
    expect(getSpeechRecognition({ webkitSpeechRecognition: Webkit })).toBe(Webkit);
  });

  it("returns null when the browser has no speech recognition", () => {
    expect(getSpeechRecognition({})).toBeNull();
    expect(getSpeechRecognition(undefined)).toBeNull();
  });
});

describe("mergeDictation", () => {
  it("returns the transcript when nothing was typed", () => {
    expect(mergeDictation("", " hello world ")).toBe("hello world");
  });

  it("separates typed text and transcript with one space", () => {
    expect(mergeDictation("Hi", "there")).toBe("Hi there");
    expect(mergeDictation("Hi ", " there")).toBe("Hi there");
  });

  it("does not add a space after a line break", () => {
    expect(mergeDictation("Line one\n", "line two")).toBe("Line one\nline two");
  });

  it("leaves typed text untouched when the transcript is empty", () => {
    expect(mergeDictation("Hi ", "")).toBe("Hi ");
    expect(mergeDictation("Hi ", "   ")).toBe("Hi ");
  });
});

describe("dictationErrorMessage", () => {
  it("explains a denied microphone permission", () => {
    expect(dictationErrorMessage("not-allowed")).toMatch(/microphone/i);
    expect(dictationErrorMessage("service-not-allowed")).toMatch(/microphone/i);
  });

  it("stays silent for errors the user caused or cannot act on", () => {
    expect(dictationErrorMessage("aborted")).toBe("");
    expect(dictationErrorMessage("no-speech")).toBe("");
  });

  it("gives a generic message for anything else", () => {
    expect(dictationErrorMessage("network")).toBeTruthy();
    expect(dictationErrorMessage("something-new")).toBeTruthy();
  });
});

describe("useDictation", () => {
  it("reports unsupported browsers and does nothing on start", () => {
    const s = setup("", {});
    expect(s.dictation.supported).toBe(false);
    s.dictation.start();
    expect(s.dictation.listening.value).toBe(false);
    expect(instances).toHaveLength(0);
  });

  it("starts a continuous, interim-results session in the browser language", () => {
    const s = setup();
    expect(s.dictation.supported).toBe(true);
    s.dictation.start();

    expect(s.rec.started).toBe(1);
    expect(s.rec.continuous).toBe(true);
    expect(s.rec.interimResults).toBe(true);
    expect(s.rec.lang).toBe("en-GB");
    expect(s.dictation.listening.value).toBe(true);
  });

  it("appends dictated text to what was already typed", () => {
    const s = setup("Dear team,");
    s.dictation.start();
    s.rec.emit([["the release is ready", true]]);
    expect(s.text).toBe("Dear team, the release is ready");
  });

  it("replaces interim results instead of stacking them", () => {
    const s = setup();
    s.dictation.start();
    s.rec.emit([["hel", false]]);
    expect(s.text).toBe("hel");
    s.rec.emit([["hello wor", false]]);
    expect(s.text).toBe("hello wor");
    s.rec.emit([["hello world", true]]);
    expect(s.text).toBe("hello world");
    s.rec.emit([["hello world", true], ["how are", false]], 1);
    expect(s.text).toBe("hello world how are");
    s.rec.emit([["hello world", true], ["how are you", true]], 1);
    expect(s.text).toBe("hello world how are you");
  });

  it("keeps edits typed by hand in the middle of a session", () => {
    const s = setup();
    s.dictation.start();
    s.rec.emit([["first sentence", true]]);
    expect(s.text).toBe("first sentence");

    s.text = "First sentence, edited.";
    s.rec.emit([["first sentence", true], ["second one", true]], 1);
    expect(s.text).toBe("First sentence, edited. second one");
  });

  it("does not duplicate an unfinished phrase when the user types during it", () => {
    const s = setup();
    s.dictation.start();
    s.rec.emit([["hello wor", false]]);
    expect(s.text).toBe("hello wor");

    // The user types in front while the phrase is still being recognised.
    s.text = "Note: hello wor";
    s.rec.emit([["hello world", false]]);
    expect(s.text).toBe("Note: hello world");

    s.rec.emit([["hello world", true]]);
    expect(s.text).toBe("Note: hello world");
  });

  it("cancel() stops at once and ignores late results", () => {
    const s = setup();
    s.dictation.start();
    s.rec.emit([["send this", false]]);
    const rec = s.rec;

    s.dictation.cancel();
    expect(rec.aborted).toBe(1);
    expect(s.dictation.listening.value).toBe(false);

    // The field is cleared by the send; the final result must not refill it.
    s.text = "";
    rec.emit([["send this now", true]]);
    expect(s.text).toBe("");
  });

  it("stop() ends the session", () => {
    const s = setup();
    s.dictation.start();
    s.dictation.stop();
    expect(s.rec.stopped).toBe(1);
    expect(s.dictation.listening.value).toBe(false);
  });

  it("toggle() starts, then stops", () => {
    const s = setup();
    s.dictation.toggle();
    expect(s.dictation.listening.value).toBe(true);
    s.dictation.toggle();
    expect(s.dictation.listening.value).toBe(false);
    expect(instances).toHaveLength(1);
  });

  it("does not open a second session while one is running", () => {
    const s = setup();
    s.dictation.start();
    s.dictation.start();
    expect(instances).toHaveLength(1);
  });

  it("stops listening when the browser ends the session by itself", () => {
    const s = setup();
    s.dictation.start();
    s.rec.onend();
    expect(s.dictation.listening.value).toBe(false);
  });

  it("surfaces a permission error and stops listening", () => {
    const s = setup();
    s.dictation.start();
    s.rec.onerror({ error: "not-allowed" });
    s.rec.onend();
    expect(s.dictation.listening.value).toBe(false);
    expect(s.dictation.error.value).toMatch(/microphone/i);
  });

  it("clears the previous error when a new session starts", () => {
    const s = setup();
    s.dictation.start();
    s.rec.onerror({ error: "not-allowed" });
    s.rec.onend();
    s.dictation.start();
    expect(s.dictation.error.value).toBe("");
  });

  it("recovers when the recognizer throws on start", () => {
    class Throwing extends FakeRecognition {
      start() {
        throw new Error("already started");
      }
    }
    const s = setup("", { SpeechRecognition: Throwing });
    s.dictation.start();
    expect(s.dictation.listening.value).toBe(false);
    expect(s.dictation.error.value).toBeTruthy();
  });

  it("a late result after stop() does not rewrite the text", () => {
    const s = setup();
    s.dictation.start();
    s.rec.emit([["keep this", true]]);
    const rec = s.rec;
    s.dictation.stop();
    s.text = "";
    rec.emit([["keep this", true], ["ghost", true]], 1);
    expect(s.text).toBe("");
  });
});
