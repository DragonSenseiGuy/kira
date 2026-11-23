/**
 * Loopback providers (Ollama / LM Studio on the user's machine) must be
 * called straight from the browser for EVERY completion, including the
 * background ones (titles, summaries, compression, notepad). The server
 * relay rejects loopback upstreams, so relaying them left chats "Untitled".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../app/composables/useSession", () => ({
  getSessionToken: vi.fn(async () => "test-session-token"),
}));

import { postChatCompletion, requestCompletion } from "../app/composables/apiClient.js";
import { getBackgroundTarget } from "../app/composables/backgroundCredentials.js";

const LOCAL = "http://localhost:11434/v1";
const REMOTE = "https://openrouter.ai/api/v1";

function settingsWith(baseUrl) {
  return {
    active_provider_id: "pr_x",
    selected_model_id: "pr_x::some-model",
    custom_providers: [{ id: "pr_x", name: "X", baseUrl, apiKey: "sk-test" }],
  };
}

describe("completions aimed at a loopback upstream", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("go straight to the runtime, not through /api/ai", async () => {
    await postChatCompletion({ model: "m", messages: [], customApiKey: "sk-test", upstreamBaseUrl: LOCAL });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(`${LOCAL}/chat/completions`);
  });

  it("authenticate with a Bearer key and keep relay-only fields out of the body", async () => {
    await postChatCompletion({ model: "m", messages: [], customApiKey: "sk-test", upstreamBaseUrl: `${LOCAL}/` });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${LOCAL}/chat/completions`);
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty("upstreamBaseUrl");
    expect(body).not.toHaveProperty("customApiKey");
  });

  it("also covers non-streaming background requests", async () => {
    await requestCompletion({ model: "m", messages: [], upstreamBaseUrl: "http://127.0.0.1:1234/v1" });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:1234/v1/chat/completions");
    expect(JSON.parse(init.body).stream).toBe(false);
  });

  it("leave remote upstreams on the server relay", async () => {
    await postChatCompletion({ model: "m", messages: [], customApiKey: "sk-test", upstreamBaseUrl: REMOTE });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/ai");
    expect(JSON.parse(init.body).upstreamBaseUrl).toBe(REMOTE);
    expect(init.headers["x-api-key"]).toBe("sk-test");
  });
});

describe("getBackgroundTarget", () => {
  it("resolves a loopback provider to a target that reaches it directly", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    globalThis.fetch = fetchSpy;
    try {
      const target = await getBackgroundTarget(settingsWith(LOCAL));
      const { model, ...credentials } = target;
      expect(model).toBe("some-model");

      await requestCompletion({ model, messages: [], ...credentials });
      expect(fetchSpy.mock.calls[0][0]).toBe(`${LOCAL}/chat/completions`);
    } finally {
      delete globalThis.fetch;
    }
  });

  it("keeps a remote provider on the relay", async () => {
    const target = await getBackgroundTarget(settingsWith(REMOTE));
    expect(target.upstreamBaseUrl).toBe(REMOTE);
    expect(target.directBaseUrl).toBeUndefined();
  });
});

describe("canApplyGeneratedTitle", () => {
  it("lets a generated title replace the placeholder", async () => {
    const { canApplyGeneratedTitle } = await import("../app/composables/storeConversations.js");
    expect(canApplyGeneratedTitle({ id: "c1", title: "Untitled" })).toBe(true);
    expect(canApplyGeneratedTitle({ id: "c1" })).toBe(true);
    expect(canApplyGeneratedTitle(undefined)).toBe(true);
  });

  it("keeps a name the user chose while the title was being generated", async () => {
    const { canApplyGeneratedTitle } = await import("../app/composables/storeConversations.js");
    expect(canApplyGeneratedTitle({ id: "c1", title: "My trip plan" })).toBe(false);
  });
});
