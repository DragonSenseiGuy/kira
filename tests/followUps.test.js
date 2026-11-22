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
    expect(complete.mock.calls[0][0]).toMatchObject({ model: "m", directBaseUrl: "http://localhost:11434/v1" });
    expect(complete.mock.calls[0][0].upstreamBaseUrl).toBeUndefined();
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

describe("request routing with the real target resolver", () => {
  const messages = [
    { id: "u1", role: "user", content: "hi" },
    { id: "a1", role: "assistant", content: "hello" },
  ];
  const settingsFor = (baseUrl) => ({
    selected_model_id: "p1::m1",
    custom_providers: [{ id: "p1", name: "P", baseUrl, apiKey: "k", models: [{ id: "m1", name: "M" }] }],
  });
  const run = async (baseUrl) => {
    const { getBackgroundTarget } = await import("../app/composables/backgroundCredentials.js");
    const complete = vi.fn(async () => ({ choices: [{ message: { content: '["a?","b?","c?"]' } }] }));
    await useFollowUps().requestFollowUps(messages, { getTarget: () => getBackgroundTarget(settingsFor(baseUrl)), complete });
    return complete.mock.calls[0][0];
  };

  it("calls a keyed loopback provider directly from the browser", async () => {
    const payload = await run("http://localhost:1234/v1");
    expect(payload).toMatchObject({ model: "m1", customApiKey: "k", directBaseUrl: "http://localhost:1234/v1" });
    expect(payload.upstreamBaseUrl).toBeUndefined();
  });

  it("relays a remote custom provider", async () => {
    const payload = await run("https://api.example.com/v1");
    expect(payload).toMatchObject({ model: "m1", customApiKey: "k", upstreamBaseUrl: "https://api.example.com/v1" });
    expect(payload.directBaseUrl).toBeUndefined();
  });
});

describe("parseFollowUps with chatty models", () => {
  it("finds the array when the surrounding prose has brackets", () => {
    expect(parseFollowUps('Sure [see below]:\n["One?", "Two?", "Three?"]\nHope that helps [end]')).toEqual(["One?", "Two?", "Three?"]);
  });

  it("does not count an introduction above a list as a suggestion", () => {
    expect(parseFollowUps("Here are some ideas:\n1. One?\n2. Two?\n3. Three?")).toEqual(["One?", "Two?", "Three?"]);
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

describe("parseFollowUps review cases", () => {
  it("keeps numbered questions that contain an inline array", () => {
    const reply = '1. How do I validate ["read", "write"]?\n2. What happens if I access roles[0]?\n3. Can you show a test?';
    expect(parseFollowUps(reply)).toEqual([
      'How do I validate ["read", "write"]?',
      "What happens if I access roles[0]?",
      "Can you show a test?",
    ]);
  });

  it("returns nothing for an empty or string-free array", () => {
    expect(parseFollowUps("[]")).toEqual([]);
    expect(parseFollowUps("```json\n[]\n```")).toEqual([]);
    expect(parseFollowUps("[1, null, {}]")).toEqual([]);
  });

  it("keeps an unmarked question inside a list", () => {
    const reply = "Here are some ideas:\n1. How does the API work?\n2. Can you show an example?\nWhat errors can it return?";
    expect(parseFollowUps(reply)).toEqual([
      "How does the API work?",
      "Can you show an example?",
      "What errors can it return?",
    ]);
  });
});

describe("parseFollowUps list commentary", () => {
  it("skips a heading between items and a trailing sign-off", () => {
    const reply = "1. How do I authenticate?\nTwo more ideas:\n2. How do I refresh the token?\n3. How do I revoke it?\nLet me know which one you like!";
    expect(parseFollowUps(reply)).toEqual(["How do I authenticate?", "How do I refresh the token?", "How do I revoke it?"]);
  });

  it("uses a fenced array even between numbered commentary", () => {
    const reply = '1. Suggested questions:\n```json\n["How do I authenticate?", "How do I revoke a token?"]\n```\n2. Pick one to continue.';
    expect(parseFollowUps(reply)).toEqual(["How do I authenticate?", "How do I revoke a token?"]);
  });

  it("keeps an unnumbered request or quoted question in a list", () => {
    expect(parseFollowUps("1. How do I authenticate?\n2. How do I revoke a token?\nShow me a curl example.")).toEqual([
      "How do I authenticate?",
      "How do I revoke a token?",
      "Show me a curl example.",
    ]);
    expect(parseFollowUps('1. How do I authenticate?\n2. How do I revoke a token?\n"Can you show me a curl example?"')).toEqual([
      "How do I authenticate?",
      "How do I revoke a token?",
      "Can you show me a curl example?",
    ]);
    expect(parseFollowUps("1. A?\nTwo more ideas:\n2. B?\nLet me know if you want more.")).toEqual(["A?", "B?"]);
  });
});
