import { describe, it, expect } from "vitest";
import { lastCopyableReply } from "../app/utils/lastReply.js";

const textOf = (message) => message.content || "";

describe("lastCopyableReply", () => {
  it("returns the newest assistant message with text", () => {
    const messages = [
      { id: 1, role: "user", content: "hi" },
      { id: 2, role: "assistant", content: "first" },
      { id: 3, role: "user", content: "more" },
      { id: 4, role: "assistant", content: "second" },
      { id: 5, role: "user", content: "pending" },
    ];
    expect(lastCopyableReply(messages, textOf).id).toBe(4);
  });

  it("skips a reply that has no text yet", () => {
    const messages = [
      { id: 1, role: "assistant", content: "done" },
      { id: 2, role: "user", content: "next" },
      { id: 3, role: "assistant", content: "  " },
    ];
    expect(lastCopyableReply(messages, textOf).id).toBe(1);
  });

  it("returns null when there is nothing to copy", () => {
    expect(lastCopyableReply([], textOf)).toBeNull();
    expect(lastCopyableReply([{ id: 1, role: "user", content: "hi" }], textOf)).toBeNull();
    expect(lastCopyableReply(undefined, textOf)).toBeNull();
  });
});
