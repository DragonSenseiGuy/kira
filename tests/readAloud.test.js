/**
 * Tests for app/composables/useReadAloud.js — reading assistant messages
 * aloud with the browser's speechSynthesis.
 *
 * Pins down:
 *   - Markdown is turned into speakable prose (no syntax, no code, no URLs)
 *   - long text is split into short utterances at sentence boundaries
 *     (Chrome silently cuts off long utterances)
 *   - one message speaks at a time; toggling stops; stale callbacks from a
 *     cancelled message never clobber the one now playing
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  speechTextFromMarkdown,
  chunkSpeechText,
  useReadAloud,
} from "../app/composables/useReadAloud.js";

describe("speechTextFromMarkdown", () => {
  it("drops emphasis, heading and list markers", () => {
    const text = speechTextFromMarkdown("# Title\n\nSome **bold** and *italic* and ~~gone~~ text.\n\n- one\n- two\n\n1. first\n> quoted");
    expect(text).not.toMatch(/[#*~>]/);
    expect(text).toContain("Title");
    expect(text).toContain("Some bold and italic and gone text.");
    expect(text).toContain("one");
    expect(text).toContain("first");
    expect(text).toContain("quoted");
    expect(text).not.toMatch(/(^|\n)\s*-\s/);
    expect(text).not.toMatch(/(^|\n)\s*1\.\s/);
  });

  it("keeps link text and drops the URL", () => {
    const text = speechTextFromMarkdown("See [the docs](https://example.com/a?b=c) and ![a cat](https://example.com/cat.png).");
    expect(text).toBe("See the docs and a cat.");
  });

  it("does not read fenced code aloud", () => {
    const text = speechTextFromMarkdown("Run this:\n\n```js\nconst secret = 42;\n```\n\nThen stop.");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("```");
    expect(text).toContain("Run this:");
    expect(text).toContain("Then stop.");
  });

  it("keeps inline code words without the backticks", () => {
    expect(speechTextFromMarkdown("Call `render()` twice.")).toBe("Call render() twice.");
  });

  it("removes HTML tags and table pipes", () => {
    const text = speechTextFromMarkdown("<b>Hi</b>\n\n| Name | Age |\n| --- | --- |\n| Ann | 30 |");
    expect(text).not.toMatch(/[<>|]/);
    expect(text).not.toContain("---");
    expect(text).toContain("Hi");
    expect(text).toContain("Ann");
    expect(text).toContain("30");
  });

  it("returns an empty string for empty or non-string input", () => {
    expect(speechTextFromMarkdown("")).toBe("");
    expect(speechTextFromMarkdown(null)).toBe("");
    expect(speechTextFromMarkdown("```\nonly code\n```")).toBe("");
  });
});

describe("speechTextFromMarkdown edge cases", () => {
  it("keeps prices written with escaped dollar signs", () => {
    expect(speechTextFromMarkdown("Plans cost \\$5 to \\$10 a month.")).toBe("Plans cost $5 to $10 a month.");
  });

  it("still drops inline math next to an escaped dollar", () => {
    expect(speechTextFromMarkdown("It costs \\$5 and $x^2$ is math.")).toBe("It costs $5 and is math.");
  });

  it("omits a four-backtick block that shows a three-backtick fence", () => {
    const markdown = "Write it like this:\n\n````markdown\n```js\nconsole.log(1);\n```\n````\n\nDone.";
    expect(speechTextFromMarkdown(markdown)).toBe("Write it like this:\nDone.");
  });

  it("omits indented code blocks but keeps nested list items", () => {
    expect(speechTextFromMarkdown("Run:\n\n    npm install\n    npm test\n\nThen wait.")).toBe("Run:\nThen wait.");
    expect(speechTextFromMarkdown("- one\n\n    - nested item\n")).toBe("one\nnested item");
  });

  it("omits an unterminated fence while streaming", () => {
    expect(speechTextFromMarkdown("Here:\n```js\nlet a = 1;")).toBe("Here:");
  });
});

describe("chunkSpeechText", () => {
  it("returns no chunks for blank text", () => {
    expect(chunkSpeechText("   ")).toEqual([]);
  });

  it("keeps short text as one chunk", () => {
    expect(chunkSpeechText("Hello there. How are you?", 200)).toEqual(["Hello there. How are you?"]);
  });

  it("splits at sentence boundaries and never exceeds the limit", () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i}.`);
    const chunks = chunkSpeechText(sentences.join(" "), 80);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80);
      expect(chunk).toMatch(/\.$/);
    }
    expect(chunks.join(" ")).toBe(sentences.join(" "));
  });

  it("splits a single over-long sentence at word boundaries", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
    const chunks = chunkSpeechText(words.join(" "), 50);

    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(50);
    expect(chunks.join(" ")).toBe(words.join(" "));
  });
});

describe("useReadAloud", () => {
  let spoken;
  let cancels;
  let win;

  class FakeUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  beforeEach(() => {
    spoken = [];
    cancels = 0;
    win = {
      SpeechSynthesisUtterance: FakeUtterance,
      speechSynthesis: {
        speak: (utterance) => spoken.push(utterance),
        cancel: () => {
          cancels++;
        },
      },
    };
  });

  /** Finishes every utterance queued so far, in order. */
  function finishAll(from = 0) {
    for (const utterance of spoken.slice(from)) utterance.onend?.();
  }

  it("reports unsupported browsers and does nothing", () => {
    const reader = useReadAloud({ win: {} });
    expect(reader.supported).toBe(false);
    reader.toggle("m1", "Hello");
    expect(reader.speakingId.value).toBeNull();
  });

  it("speaks a message as prose and tracks which one is playing", () => {
    const reader = useReadAloud({ win });
    expect(reader.supported).toBe(true);

    reader.toggle("m1", "**Hello** world.");
    expect(reader.speakingId.value).toBe("m1");
    expect(spoken.map((u) => u.text)).toEqual(["Hello world."]);
  });

  it("clears the state once the last utterance ends", () => {
    const reader = useReadAloud({ win });
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    reader.toggle("m1", long);
    expect(spoken.length).toBeGreaterThan(1);

    spoken[0].onend();
    expect(reader.speakingId.value).toBe("m1");
    finishAll(1);
    expect(reader.speakingId.value).toBeNull();
  });

  it("toggling the playing message stops it", () => {
    const reader = useReadAloud({ win });
    reader.toggle("m1", "Hello world.");
    reader.toggle("m1", "Hello world.");
    expect(cancels).toBeGreaterThan(0);
    expect(reader.speakingId.value).toBeNull();
    expect(spoken).toHaveLength(1);
  });

  it("switching messages stops the first and plays the second", () => {
    const reader = useReadAloud({ win });
    reader.toggle("m1", "First message.");
    reader.toggle("m2", "Second message.");

    expect(cancels).toBeGreaterThan(0);
    expect(reader.speakingId.value).toBe("m2");
    expect(spoken.map((u) => u.text)).toEqual(["First message.", "Second message."]);

    // The cancelled utterance reports back late: it must not stop m2.
    spoken[0].onend?.();
    spoken[0].onerror?.({ error: "interrupted" });
    expect(reader.speakingId.value).toBe("m2");
  });

  it("stop() silences everything", () => {
    const reader = useReadAloud({ win });
    reader.toggle("m1", "Hello world.");
    reader.stop();
    expect(cancels).toBeGreaterThan(0);
    expect(reader.speakingId.value).toBeNull();
  });

  it("resets when the browser reports a synthesis error", () => {
    const reader = useReadAloud({ win });
    reader.toggle("m1", "Hello world.");
    spoken[0].onerror({ error: "synthesis-failed" });
    expect(reader.speakingId.value).toBeNull();
  });

  it("does not start for a message with nothing speakable", () => {
    const reader = useReadAloud({ win });
    reader.toggle("m1", "```\ncode only\n```");
    expect(reader.speakingId.value).toBeNull();
    expect(spoken).toHaveLength(0);
  });
});
