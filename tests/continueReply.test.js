import { describe, it, expect } from "vitest";
import { continuableMessageId, isTruncated } from "../app/utils/continueReply.js";

const user = { id: "u", role: "user", content: "hi", complete: true };
const cut = { id: "a", role: "assistant", content: "half", complete: true, truncated: true };

describe("isTruncated", () => {
  it("is true only for the length finish reason", () => {
    expect(isTruncated("length")).toBe(true);
    for (const reason of ["stop", "tool_calls", "content_filter", null, undefined]) {
      expect(isTruncated(reason)).toBe(false);
    }
  });
});

describe("continuableMessageId", () => {
  it("offers Continue on a cut-off last reply", () => {
    expect(continuableMessageId([user, cut], false)).toBe("a");
  });

  it("does not offer it once the chat has moved on", () => {
    expect(continuableMessageId([user, cut, { ...user, id: "u2" }], false)).toBeNull();
    expect(
      continuableMessageId([user, cut, { ...user, id: "u2" }, { id: "b", role: "assistant", complete: true }], false),
    ).toBeNull();
  });

  it("does not offer it while a reply is streaming or unfinished", () => {
    expect(continuableMessageId([user, cut], true)).toBeNull();
    expect(continuableMessageId([user, { ...cut, complete: false }], false)).toBeNull();
  });

  it("does not offer it for a normal or failed reply, or an empty chat", () => {
    expect(continuableMessageId([user, { ...cut, truncated: false }], false)).toBeNull();
    expect(continuableMessageId([user, { ...cut, error: true }], false)).toBeNull();
    expect(continuableMessageId([], false)).toBeNull();
    expect(continuableMessageId(null, false)).toBeNull();
  });
});
