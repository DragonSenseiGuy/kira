import { describe, it, expect, vi, afterEach } from "vitest";
import {
  conversationToMarkdown,
  markdownFileName,
  downloadConversationMarkdown,
} from "../app/utils/conversationMarkdown.js";

const user = (id, parentId, content, extra = {}) => ({ id, parentId, role: "user", content, branchIndex: 0, ...extra });
const bot = (id, parentId, content, extra = {}) => ({ id, parentId, role: "assistant", content, branchIndex: 0, ...extra });

describe("conversationToMarkdown", () => {
  it("writes the title and each turn under a heading", () => {
    const md = conversationToMarkdown({
      title: "Trip plan",
      messages: [user("1", null, "Where to?"), bot("2", "1", "Try **Lisbon**.")],
    });
    expect(md).toBe("# Trip plan\n\n## You\n\nWhere to?\n\n## Kira\n\nTry **Lisbon**.\n");
  });

  it("leaves out tool results, reasoning and empty turns", () => {
    const md = conversationToMarkdown({
      title: "T",
      messages: [
        user("1", null, "Search it"),
        bot("2", "1", "", { reasoning: "thinking hard", tool_calls: [{ id: "c" }] }),
        { id: "3", parentId: "2", role: "tool", content: "RAW TOOL OUTPUT", branchIndex: 0 },
        bot("4", "3", "Found it.", { reasoning: "secret thoughts" }),
      ],
    });
    expect(md).toBe("# T\n\n## You\n\nSearch it\n\n## Kira\n\nFound it.\n");
  });

  it("exports only the branch that is shown", () => {
    const messages = [
      user("1", null, "Q"),
      bot("2", "1", "first answer", { branchIndex: 0 }),
      bot("3", "1", "second answer", { branchIndex: 1 }),
    ];
    expect(conversationToMarkdown({ title: "B", messages, branchPath: [1] })).toContain("second answer");
    expect(conversationToMarkdown({ title: "B", messages, branchPath: [1] })).not.toContain("first answer");
    expect(conversationToMarkdown({ title: "B", messages, branchPath: [0] })).toContain("first answer");
  });

  it("lists attachments by name, even with no text", () => {
    const md = conversationToMarkdown({
      title: "Files",
      messages: [user("1", null, "", { attachments: [{ filename: "a.png", url: "data:image/png;base64,AAAA" }, { name: "notes.txt" }] })],
    });
    expect(md).toContain("_Attachment: a.png_  \n_Attachment: notes.txt_");
    expect(md).not.toContain("base64");
  });

  it("falls back to a title and copes with an empty conversation", () => {
    expect(conversationToMarkdown({ title: "  ", messages: [] })).toBe("# Untitled chat\n");
    expect(conversationToMarkdown(null)).toBe("# Untitled chat\n");
    expect(conversationToMarkdown({ title: "Two\nlines" })).toBe("# Two lines\n");
  });
});

describe("conversationToMarkdown review cases", () => {
  it("closes a fence left open by a stopped reply", () => {
    const md = conversationToMarkdown({
      title: "T",
      messages: [user("1", null, "code?"), bot("2", "1", "Here:\n\n````js\nconst a = 1;\n```\nmore"), user("3", "2", "next")],
    });
    expect(md).toContain("const a = 1;\n```\nmore\n````\n\n## You\n\nnext\n");
  });

  it("leaves closed fences alone, including tilde fences", () => {
    const content = "~~~\n```\n~~~\n\n```py\nx\n```";
    const md = conversationToMarkdown({ title: "T", messages: [user("1", null, "q"), bot("2", "1", content)] });
    expect(md).toBe(`# T\n\n## You\n\nq\n\n## Kira\n\n${content}\n`);
  });

  it("separates text written before and after a tool call", () => {
    const md = conversationToMarkdown({
      title: "T",
      messages: [
        user("1", null, "look it up"),
        bot("2", "1", "Let me check.## Results\nDone", {
          reasoning: "hidden thoughts",
          parts: [
            { type: "reasoning", content: "hidden thoughts" },
            { type: "content", content: "Let me check." },
            { type: "tool_group", tools: [{ name: "search", result: "RAW" }] },
            { type: "content", content: "## Results\nDone" },
          ],
        }),
      ],
    });
    expect(md).toContain("## Kira\n\nLet me check.\n\n## Results\nDone\n");
    expect(md).not.toContain("hidden thoughts");
    expect(md).not.toContain("RAW");
  });

  it("keeps the indentation of a reply that starts with indented code", () => {
    const md = conversationToMarkdown({ title: "T", messages: [user("1", null, "q"), bot("2", "1", "\n    indented code\n\ntext\n")] });
    expect(md).toContain("## Kira\n\n    indented code\n\ntext\n");
  });
});

describe("markdownFileName", () => {
  it("removes characters that are not allowed in file names", () => {
    expect(markdownFileName('a/b\\c: d*?"<>|')).toBe("a b c d.md");
    expect(markdownFileName("../../etc/passwd")).toBe("etc passwd.md");
  });

  it("limits the length and falls back when empty", () => {
    expect(markdownFileName("x".repeat(200))).toBe(`${"x".repeat(80)}.md`);
    expect(markdownFileName("")).toBe("chat.md");
    expect(markdownFileName("???")).toBe("chat.md");
  });
});

describe("downloadConversationMarkdown", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads a .md file named after the conversation", async () => {
    let blob;
    URL.createObjectURL = vi.fn((b) => ((blob = b), "blob:x"));
    URL.revokeObjectURL = vi.fn();
    let name;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      name = this.download;
    });
    downloadConversationMarkdown({ title: "Trip plan", messages: [user("1", null, "Hi")] });
    expect(name).toBe("Trip plan.md");
    expect(await blob.text()).toBe("# Trip plan\n\n## You\n\nHi\n");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
