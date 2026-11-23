import { describe, it, expect, afterEach } from "vitest";
import { noteReplyFinished, useUnseenReply, tabTitleTemplate } from "~/composables/tabAttention";

function setHidden(hidden) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("tab attention", () => {
  afterEach(() => setHidden(false));

  it("does nothing when the reply finishes in the tab being looked at", () => {
    setHidden(false);
    noteReplyFinished();
    expect(useUnseenReply().value).toBe(false);
  });

  it("flags a reply that finished in the background until the tab is shown", () => {
    setHidden(true);
    noteReplyFinished();
    expect(useUnseenReply().value).toBe(true);
    setHidden(true);
    expect(useUnseenReply().value).toBe(true);
    setHidden(false);
    expect(useUnseenReply().value).toBe(false);
  });

  it("marks the tab title only while a reply is waiting", () => {
    expect(tabTitleTemplate(true)).toBe("● %s");
    expect(tabTitleTemplate(false)).toBe("%s");
  });
});
