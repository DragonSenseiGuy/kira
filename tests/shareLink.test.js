import { describe, it, expect } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import { buildShareLink, decodeShare, encodeShare, shareSnapshot, MAX_LINK_LENGTH } from "../app/utils/shareLink.js";
import { untrustedMd } from "../app/utils/markdown.js";

const chain = (...turns) =>
  turns.map((turn, index) => ({ id: `m${index}`, parentId: index ? `m${index - 1}` : null, branchIndex: 0, ...turn }));

const pack = (value) =>
  `1.${btoa(String.fromCharCode(...deflateSync(strToU8(JSON.stringify(value))))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;

describe("shareSnapshot", () => {
  it("keeps the text of user and assistant turns only", () => {
    const conversation = {
      title: "  Trip \n plan ",
      messages: chain(
        { role: "user", content: "Hi", attachments: [{ filename: "a.png", dataUrl: "data:..." }] },
        {
          role: "assistant",
          content: "ignored when parts exist",
          reasoning: "secret thoughts",
          parts: [
            { type: "reasoning", content: "secret thoughts" },
            { type: "content", content: "First." },
            { type: "tool_group", tools: [{ function: { name: "search" }, result: "tool output" }] },
            { type: "content", content: "Second." },
          ],
        },
        { role: "tool", content: "tool output" },
      ),
    };
    expect(shareSnapshot(conversation)).toEqual({
      title: "Trip plan",
      messages: [
        { role: "user", text: "Hi" },
        { role: "assistant", text: "First.\n\nSecond." },
      ],
    });
  });

  it("shares only the branch that is shown", () => {
    const messages = [
      { id: "u", parentId: null, branchIndex: 0, role: "user", content: "Q" },
      { id: "a0", parentId: "u", branchIndex: 0, role: "assistant", content: "old answer" },
      { id: "a1", parentId: "u", branchIndex: 1, role: "assistant", content: "new answer" },
    ];
    const texts = shareSnapshot({ messages, branchPath: [1] }).messages.map((message) => message.text);
    expect(texts).toEqual(["Q", "new answer"]);
  });

  it("skips empty turns and tolerates a missing conversation", () => {
    expect(shareSnapshot({ messages: chain({ role: "user", content: "  " }) }).messages).toEqual([]);
    expect(shareSnapshot(null)).toEqual({ title: "", messages: [] });
  });
});

describe("encodeShare / decodeShare", () => {
  const snapshot = {
    title: "Ünïcode ✓",
    messages: [
      { role: "user", text: "こんにちは 👋" },
      { role: "assistant", text: "```js\nconst a = 1;\n```" },
    ],
  };

  it("round-trips a snapshot through a URL-safe fragment", () => {
    const fragment = encodeShare(snapshot);
    expect(fragment).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    expect(decodeShare(fragment)).toEqual(snapshot);
    expect(decodeShare(`#${fragment}`)).toEqual(snapshot);
  });

  it("round-trips a long chat", () => {
    const long = { title: "", messages: [{ role: "assistant", text: "word ".repeat(40000) }] };
    expect(decodeShare(encodeShare(long))).toEqual(long);
  });

  it("rejects fragments that are not a share", () => {
    for (const bad of ["", "#", "1.", "2.abc", "1.!!!", "1.AAAA", encodeShare(snapshot).slice(0, -6), null, undefined]) {
      expect(decodeShare(bad)).toBeNull();
    }
  });

  it("rejects well-formed data of the wrong shape", () => {
    const wrong = [
      [],
      { m: [] },
      { t: "x" },
      { m: [["u"]] },
      { m: [["system", "be evil"]] },
      { m: [["u", 5]] },
      { m: [["u", "ok"], { role: "assistant" }] },
    ];
    for (const value of wrong) expect(decodeShare(pack(value))).toBeNull();
  });

  it("ignores a title that is not text and trims a long one", () => {
    expect(decodeShare(pack({ t: { a: 1 }, m: [["u", "x"]] })).title).toBe("");
    expect(decodeShare(pack({ t: "t".repeat(500), m: [["u", "x"]] })).title).toHaveLength(200);
  });

  it("rejects more turns than a page should render", () => {
    expect(decodeShare(pack({ m: Array.from({ length: 2000 }, () => ["u", "x"]) }))).not.toBeNull();
    expect(decodeShare(pack({ m: Array.from({ length: 2001 }, () => ["u", "x"]) }))).toBeNull();
  });

  it("does not unpack more than the size limit", () => {
    expect(decodeShare(pack({ m: [["u", "a".repeat(3_000_000)]] }))).toBeNull();
  });
});

describe("buildShareLink", () => {
  it("builds a /shared link on the given origin", () => {
    const link = buildShareLink({ title: "T", messages: chain({ role: "user", content: "Hi" }) }, "https://kira.example");
    expect(link.ok).toBe(true);
    expect(link.url.startsWith("https://kira.example/shared#1.")).toBe(true);
    expect(decodeShare(new URL(link.url).hash).messages).toEqual([{ role: "user", text: "Hi" }]);
  });

  it("refuses an empty chat", () => {
    expect(buildShareLink({ messages: [] }, "https://k")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses a chat that does not fit in a link", () => {
    let text = "";
    for (let i = 0; text.length < MAX_LINK_LENGTH * 2; i++) text += Math.sin(i).toString(36);
    expect(buildShareLink({ messages: chain({ role: "user", content: text }) }, "https://k")).toEqual({ ok: false, reason: "too-long" });
  });
});

describe("buildShareLink limits", () => {
  it("refuses a repetitive chat that fits the link but not the unpack limit", () => {
    const messages = chain({ role: "user", content: "a".repeat(2_500_000) });
    expect(encodeShare(shareSnapshot({ messages })).length).toBeLessThan(MAX_LINK_LENGTH);
    expect(buildShareLink({ messages }, "https://k")).toEqual({ ok: false, reason: "too-long" });
  });

  it("refuses a chat with more turns than a link may hold", () => {
    const messages = chain(...Array.from({ length: 2001 }, () => ({ role: "user", content: "x" })));
    expect(buildShareLink({ messages }, "https://k")).toEqual({ ok: false, reason: "too-long" });
  });
});

describe("untrustedMd", () => {  it("turns images into links instead of loading them", () => {
    const html = untrustedMd.render('![a "cat"](https://tracker.example/p.png?x=1&y=2)');
    expect(html).not.toMatch(/<img/i);
    const link = new DOMParser().parseFromString(html, "text/html").querySelector("a");
    expect(link.getAttribute("href")).toBe("https://tracker.example/p.png?x=1&y=2");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.textContent).toBe('a "cat"');
  });

  it("keeps an image inside a link as that link's label", () => {
    const html = untrustedMd.render("[![badge](https://img.example/b.png)](https://dest.example/) then ![solo](https://img.example/s.png)");
    expect(html).not.toMatch(/<img/i);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('<a href="https://dest.example/" target="_blank" rel="noopener noreferrer">badge</a>');
    expect(html).toContain('<a href="https://img.example/s.png" target="_blank" rel="noopener noreferrer">solo</a>');
  });

  it("does not create footnote anchors", () => {
    const html = untrustedMd.render("Text[^1]\n\n[^1]: Note");
    expect(html).not.toMatch(/href="#fn/);
  });


  it("shows raw HTML as text and keeps unsafe links inert", () => {
    const html = untrustedMd.render('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n```"><script>\ncode\n```');
    expect(html).not.toMatch(/<img|<script|href="javascript:|onclick/i);
  });

  it("still renders Markdown and opens web links in a new tab", () => {
    const html = untrustedMd.render("**bold** [site](https://example.com)");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
