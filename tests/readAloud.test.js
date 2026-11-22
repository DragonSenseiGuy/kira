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

describe("speechTextFromMarkdown review cases", () => {
  it("speaks the visible text of an HTML paragraph", () => {
    expect(speechTextFromMarkdown("<p>Check the settings before restarting.</p>")).toBe("Check the settings before restarting.");
  });

  it("keeps HTML table cells and rows apart and skips code, scripts and styles", () => {
    const text = speechTextFromMarkdown(
      "<table><tr><td>Name</td><td>Ada</td></tr><tr><td>Role</td><td>Engineer</td></tr></table>\n\n<div>Before<script>alert(1)</script><style>p{}</style><pre>x = 1</pre> after</div>",
    );
    expect(text).toBe("Name Ada\nRole Engineer\nBefore\nafter");
  });

  it("speaks bare email addresses but not bare URLs or hrefs", () => {
    expect(speechTextFromMarkdown("Email support@example.com for help.")).toBe("Email support@example.com for help.");
    expect(speechTextFromMarkdown("Write to <admin@example.org> today.")).toBe("Write to admin@example.org today.");
    expect(speechTextFromMarkdown("See https://example.com/docs for more.")).toBe("See for more.");
    expect(speechTextFromMarkdown("[Mail us](mailto:hidden@example.com) now")).toBe("Mail us now");
  });

  it("leaves math out of an image description", () => {
    expect(speechTextFromMarkdown("![Graph of $y=x^2$](https://example.org/plot.png)")).toBe("Graph of");
  });
});

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

describe("speechTextFromMarkdown code detection", () => {
  it("keeps prose after a line that starts with a triple-backtick inline span", () => {
    expect(speechTextFromMarkdown("```npm install``` installs the package.\n\nRestart the app.")).toBe(
      "npm install installs the package.\nRestart the app."
    );
  });

  it("omits fences nested in list items and quotes", () => {
    expect(speechTextFromMarkdown("- ```sh\n  npm install\n  ```\n- Restart.")).toBe("Restart.");
    expect(speechTextFromMarkdown("> Run:\n> ```sh\n> npm test\n> ```\n> Done.")).toBe("Run:\nDone.");
  });

  it("drops display math written with escaped brackets", () => {
    expect(speechTextFromMarkdown("So \\(a+b\\) holds.\n\n\\[\nx^2\n\\]\n\nDone.")).toBe("So holds.\nDone.");
  });
});

describe("speechTextFromMarkdown matches the rendered message", () => {
  it("omits a display equation that looks like a list or has a blank line", () => {
    expect(speechTextFromMarkdown("Before.\n\n$$\nx^2\n+ y^2\n$$\n\nAfter.")).toBe("Before.\nAfter.");
    expect(speechTextFromMarkdown("Before.\n\n$$\na\n\nb\n$$\n\nAfter.")).toBe("Before.\nAfter.");
  });

  it("keeps literal element names but drops real tags", () => {
    expect(speechTextFromMarkdown("Use &lt;button&gt; here.")).toBe("Use <button> here.");
    expect(speechTextFromMarkdown("A <span>real</span> tag.")).toBe("A real tag.");
  });

  it("keeps backslashes inside inline code", () => {
    expect(speechTextFromMarkdown("Run `grep -E '\\[' file.txt` now.")).toBe("Run grep -E '\\[' file.txt now.");
  });
});

describe("HTML block speech review cases", () => {
  it("reads inline commands but not preformatted code", () => {
    expect(speechTextFromMarkdown("<p>Run <code>npm test</code> first.</p>")).toBe("Run npm test first.");
    expect(speechTextFromMarkdown("<div>Before<pre><code>x = 1</code></pre>After</div>")).toBe("Before\nAfter");
  });

  it("reads only the summary of a closed disclosure", () => {
    expect(speechTextFromMarkdown("<details><summary>Answer</summary>Paris</details>")).toBe("Answer");
    expect(speechTextFromMarkdown("<details open><summary>Answer</summary>Paris</details>")).toBe("Answer\nParis");
  });

  it("skips elements marked hidden", () => {
    expect(speechTextFromMarkdown("<p>Shown <span hidden>secret</span>text</p>")).toBe("Shown text");
  });

  it("skips bare URLs but keeps emails and link labels", () => {
    expect(speechTextFromMarkdown("<p>See https://example.com/docs for more.</p>")).toBe("See for more.");
    expect(speechTextFromMarkdown('<p>Mail me@example.com or read <a href="https://example.com">the docs</a>.</p>')).toBe(
      "Mail me@example.com or read the docs.",
    );
  });

  it("does not fuse words across nested blocks", () => {
    expect(speechTextFromMarkdown("<div>Intro<p>Body</p><ul><li>One</li><li>Two</li></ul></div>")).toBe("Intro\nBody\nOne\nTwo");
  });
});

describe("HTML block speech, third review", () => {
  it("keeps the prose after a URL that ends at full-width punctuation", () => {
    expect(speechTextFromMarkdown("<p>请访问 https://example.com。然后重启应用。</p>")).toBe("请访问 。然后重启应用。");
  });

  it("keeps an email address whose domain starts with www", () => {
    expect(speechTextFromMarkdown("<p>Email support@www.example.com for help.</p>")).toBe("Email support@www.example.com for help.");
  });

  it("keeps a link label that looks like an address but skips a bare one", () => {
    expect(
      speechTextFromMarkdown('<p>Open <a href="https://example.com/docs">www.example.com</a> or https://example.org/x for help.</p>'),
    ).toBe("Open www.example.com or for help.");
  });

  it("follows the on-screen state of disclosures when given", () => {
    const source = "<details><summary>Answer</summary>Paris</details>\n\n<details open><summary>Hint</summary>France</details>";
    expect(speechTextFromMarkdown(source)).toBe("Answer\nHint\nFrance");
    expect(speechTextFromMarkdown(source, { detailsOpen: [true, false] })).toBe("Answer\nParis\nHint");
  });
});

describe("HTML block speech, fourth review", () => {
  it("drops a whole URL that contains a full-width hyphen", () => {
    expect(speechTextFromMarkdown("<p>詳しくは https://example.jp/製品－一覧 を参照。</p>")).toBe("詳しくは を参照。");
  });

  it("lines up on-screen disclosure states when one sits in a table cell", () => {
    const source = "| a |\n| --- |\n| <details><summary>Cell</summary>x</details> |\n\n<details open><summary>Hint</summary>France</details>";
    expect(speechTextFromMarkdown(source, { detailsOpen: [false, true] })).toContain("Hint\nFrance");
    expect(speechTextFromMarkdown(source, { detailsOpen: [false, false] })).not.toContain("France");
  });

  it("drops an address split by inline formatting", () => {
    expect(speechTextFromMarkdown("<p>See https://<strong>example.com</strong>/docs for help.</p>")).toBe("See for help.");
    expect(speechTextFromMarkdown('<p>Open <a href="https://example.com">www.example.com</a>https://x.test now</p>')).toBe(
      "Open www.example.com now",
    );
  });
});
