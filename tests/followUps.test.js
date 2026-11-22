import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFollowUps, buildFollowUpMessages, MAX_FOLLOW_UPS } from "../app/utils/followUps.js";
import { useFollowUps } from "../app/composables/useFollowUps.js";

describe("parseFollowUps", () => {
  it("reads a JSON array, also inside a fence or prose", () => {
    expect(parseFollowUps('["How so?", "Show an example", "What about Rust?"]')).toEqual(["How so?", "Show an example", "What about Rust?"]);
    expect(parseFollowUps('Sure!\n```json\n["A?", "B?"]\n```')).toEqual(["A?", "B?"]);
  });

  it("falls back to one suggestion per line, without bullets, numbers or quotes", () => {
    expect(parseFollowUps('1. "First one?"\n- Second one\n\n* Third one')).toEqual(["First one?", "Second one", "Third one"]);
  });

  it("drops duplicates, empty and overlong items and caps the count", () => {
    const reply = JSON.stringify(["Same", "same", "", 5, "x".repeat(200), "B", "C", "D"]);
    expect(parseFollowUps(reply)).toEqual(["Same", "B", "C"]);
    expect(parseFollowUps(reply).length).toBe(MAX_FOLLOW_UPS);
  });

  it("returns nothing for empty replies", () => {
    expect(parseFollowUps("")).toEqual([]);
    expect(parseFollowUps(null)).toEqual([]);
  });
});

describe("buildFollowUpMessages", () => {
  it("sends only the last turns, truncated, as one transcript", () => {
    const messages = [
      { role: "user", content: "old question" },
      { role: "assistant", content: "old answer" },
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "z".repeat(5000) },
    ];
    const [system, user] = buildFollowUpMessages(messages);
    expect(system.role).toBe("system");
    expect(user.content).not.toContain("old question");
    expect(user.content).toContain("User: q1");
    expect(user.content).toContain("Assistant: a1");
    expect(user.content.length).toBeLessThan(2200);
  });
});

describe("useFollowUps", () => {
  const { suggestions, forMessageId, requestFollowUps, clearFollowUps } = useFollowUps();
  const chat = [
    { id: "u1", role: "user", content: "hi" },
    { id: "a1", role: "assistant", content: "hello" },
  ];
  const reply = (items) => ({ choices: [{ message: { content: JSON.stringify(items) } }] });
  const getTarget = async () => ({ model: "m", upstreamBaseUrl: "http://localhost:11434/v1" });

  beforeEach(() => clearFollowUps());

  it("stores suggestions for the answer they were made for", async () => {
    const complete = vi.fn(async () => reply(["One?", "Two?"]));
    await requestFollowUps(chat, { getTarget, complete });
    expect(suggestions.value).toEqual(["One?", "Two?"]);
    expect(forMessageId.value).toBe("a1");
    expect(complete.mock.calls[0][0]).toMatchObject({ model: "m", upstreamBaseUrl: "http://localhost:11434/v1" });
  });

  it("asks nothing after an error, an empty answer or a user turn", async () => {
    const complete = vi.fn(async () => reply(["One?"]));
    await requestFollowUps([...chat.slice(0, 1), { id: "a1", role: "assistant", content: "x", error: true }], { getTarget, complete });
    await requestFollowUps([...chat.slice(0, 1), { id: "a1", role: "assistant", content: " " }], { getTarget, complete });
    await requestFollowUps(chat.slice(0, 1), { getTarget, complete });
    expect(complete).not.toHaveBeenCalled();
    expect(suggestions.value).toEqual([]);
  });

  it("drops a reply that arrives after the conversation moved on", async () => {
    let release;
    const complete = vi.fn(() => new Promise((r) => { release = () => r(reply(["Late?"])); }));
    const pending = requestFollowUps(chat, { getTarget, complete });
    await Promise.resolve();
    await Promise.resolve();
    clearFollowUps();
    release();
    await pending;
    expect(suggestions.value).toEqual([]);
    expect(forMessageId.value).toBe(null);
  });

  it("stays silent when the request fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await requestFollowUps(chat, { getTarget, complete: async () => { throw new Error("boom"); } });
    expect(suggestions.value).toEqual([]);
    warn.mockRestore();
  });
});

describe("wiring", () => {
  const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("is off by default and has a settings switch", () => {
    expect(read("app/composables/settings.js").match(/follow_up_suggestions: false/g).length).toBe(2);
    expect(read("app/components/settings/SettingsGeneral.vue")).toContain("set('follow_up_suggestions', $event)");
  });

  it("is requested only when enabled and cleared when the conversation moves on", () => {
    const source = read("app/composables/messagesManager.js");
    expect(source).toMatch(/settings\?\.follow_up_suggestions &&[\s\S]{0,120}requestFollowUps\(/);
    expect(source.match(/clearFollowUps\(\);/g).length).toBeGreaterThanOrEqual(5);
  });
});
