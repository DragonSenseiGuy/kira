/**
 * Sidebar activity markers: reply in progress, and reply finished elsewhere.
 */

import { describe, it, expect } from "vitest";
import {
  markReplyStarted,
  markReplyFinished,
  markChatSeen,
  clearChatActivity,
  chatActivity,
} from "../app/composables/chatActivity";

describe("chatActivity", () => {
  it("shows a chat as generating until its reply finishes", () => {
    markReplyStarted("a");
    expect(chatActivity("a")).toBe("generating");
    markReplyFinished("a", true);
    expect(chatActivity("a")).toBeNull();
  });

  it("marks a reply that finished off screen as unread until the chat is opened", () => {
    markReplyStarted("b");
    markReplyFinished("b", false);
    expect(chatActivity("b")).toBe("unread");
    markChatSeen("b");
    expect(chatActivity("b")).toBeNull();
  });

  it("keeps generating while a second reply in the same chat is still running", () => {
    markReplyStarted("c");
    markReplyStarted("c");
    markReplyFinished("c", true);
    expect(chatActivity("c")).toBe("generating");
    markReplyFinished("c", true);
    expect(chatActivity("c")).toBeNull();
  });

  it("drops the unread mark when a new reply starts", () => {
    markReplyStarted("d");
    markReplyFinished("d", false);
    markReplyStarted("d");
    expect(chatActivity("d")).toBe("generating");
    markReplyFinished("d", true);
    expect(chatActivity("d")).toBeNull();
  });

  it("ignores incognito (no id) and a chat deleted mid-reply", () => {
    markReplyStarted(null);
    markReplyFinished(null, false);
    markReplyStarted("e");
    clearChatActivity("e");
    markReplyFinished("e", false);
    expect(chatActivity("e")).toBeNull();
  });
});
