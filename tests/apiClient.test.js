/**
 * Tests for app/composables/apiClient.js
 *
 * The API client centralizes all traffic to the server-side AI proxy.
 * These tests pin down its contract:
 *   - session token is attached as `x-session-token`
 *   - BYOK key moves from `customApiKey` in the payload to the
 *     `x-api-key` header and never appears in the JSON body
 *   - non-2xx responses normalize into ApiRequestError with status/type
 *   - requestCompletion forces stream:false and parses the JSON body
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

vi.mock("../app/composables/useSession", () => ({
  getSessionToken: vi.fn(async () => "test-session-token"),
}));

import {
  postChatCompletion,
  requestCompletion,
  extractCompletionText,
  toWellFormedText,
  ApiRequestError,
} from "../app/composables/apiClient.js";

describe("postChatCompletion retries transient upstream failures", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("retries a 502 and succeeds on the next attempt", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      );

    const response = await postChatCompletion({ model: "m", messages: [] });

    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("gives up after the final attempt and surfaces the last status", async () => {
    for (let i = 0; i < 3; i++) {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "upstream down" } }), { status: 502 }),
      );
    }

    await expect(postChatCompletion({ model: "m", messages: [] })).rejects.toThrow(
      /upstream down/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors like 400", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 }),
    );

    await expect(postChatCompletion({ model: "m", messages: [] })).rejects.toThrow(
      /bad request/,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("request body well-formedness (lone surrogates)", () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.fn();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it("serializes bodies containing lone surrogates into valid UTF-8", async () => {
    const loneSurrogate = "before \uD800 after";
    await postChatCompletion({
      model: "m",
      messages: [{ role: "tool", content: loneSurrogate }],
    });

    const rawBody = fetchSpy.mock.calls[0][1].body;
    // The raw body must not contain the unpaired surrogate (it would be an
    // invalid UTF-8 sequence once encoded).
    expect(rawBody).not.toContain("\uD800");
    // And it must survive a strict UTF-8 round-trip.
    const bytes = new TextEncoder().encode(rawBody);
    expect(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toBeTruthy();
  });

  it("toWellFormedText replaces lone surrogates with U+FFFD", () => {
    const cleaned = toWellFormedText("a\uD800b");
    expect(cleaned).toContain("\uFFFD");
    expect(cleaned).toHaveLength(3);
  });
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("apiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  describe("postChatCompletion", () => {
    it("POSTs to /api/ai with the session token header", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ choices: [] }));
      globalThis.fetch = fetchMock;

      await postChatCompletion({ model: "m", messages: [] });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/ai");
      expect(init.method).toBe("POST");
      expect(init.headers["x-session-token"]).toBe("test-session-token");
      expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("moves customApiKey from the body into the x-api-key header", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ choices: [] }));
      globalThis.fetch = fetchMock;

      await postChatCompletion({
        model: "m",
        messages: [],
        customApiKey: "sk-user-key",
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers["x-api-key"]).toBe("sk-user-key");

      const sentBody = JSON.parse(init.body);
      expect(sentBody.customApiKey).toBeUndefined();
      expect(sentBody.model).toBe("m");
    });

    it("omits the x-api-key header when no key is provided", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ choices: [] }));
      globalThis.fetch = fetchMock;

      await postChatCompletion({ model: "m" });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers["x-api-key"]).toBeUndefined();
    });

    it("forwards an AbortSignal", async () => {
      const controller = new AbortController();
      const fetchMock = vi.fn(async () => jsonResponse({ choices: [] }));
      globalThis.fetch = fetchMock;

      await postChatCompletion({ model: "m" }, { signal: controller.signal });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.signal).toBe(controller.signal);
    });

    it("throws ApiRequestError with upstream details on non-2xx JSON errors", async () => {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse(
          { error: { type: "authentication_error", message: "bad key" } },
          401,
        ),
      );

      await expect(postChatCompletion({ model: "m" })).rejects.toMatchObject({
        name: "ApiRequestError",
        status: 401,
        type: "authentication_error",
        message: "bad key",
      });
    });

    it("falls back to a generic message when the error body is not JSON", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      }));

      await expect(postChatCompletion({ model: "m" })).rejects.toBeInstanceOf(
        ApiRequestError,
      );
    });

    it("wraps network failures without losing AbortError", async () => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(postChatCompletion({ model: "m" })).rejects.toMatchObject({
        name: "AbortError",
      });
    });

    it("wraps non-abort network failures in ApiRequestError", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));

      await expect(postChatCompletion({ model: "m" })).rejects.toMatchObject({
        name: "ApiRequestError",
        message: expect.stringContaining("offline"),
      });
    });

    it("directBaseUrl calls the runtime straight from the browser with Bearer auth", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ choices: [] }));
      globalThis.fetch = fetchMock;

      await postChatCompletion({
        model: "llama3",
        messages: [],
        customApiKey: "not-needed",
        directBaseUrl: "http://localhost:11434/v1",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("http://localhost:11434/v1/chat/completions");
      expect(init.headers.Authorization).toBe("Bearer not-needed");
      // No session-token relay for direct calls.
      expect(init.headers["x-session-token"]).toBeUndefined();

      const sentBody = JSON.parse(init.body);
      expect(sentBody.model).toBe("llama3");
      expect(sentBody.directBaseUrl).toBeUndefined();
    });

    it("direct-mode network failures produce a CORS-friendly message", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        postChatCompletion({
          model: "m",
          directBaseUrl: "http://localhost:11434/v1",
        }),
      ).rejects.toMatchObject({
        name: "ApiRequestError",
        message: expect.stringContaining("CORS"),
      });
    });
  });

  describe("requestCompletion", () => {
    it("sends stream:false and returns the parsed completion", async () => {
      const completion = {
        choices: [{ message: { role: "assistant", content: "hi there" } }],
      };
      const fetchMock = vi.fn(async () => jsonResponse(completion));
      globalThis.fetch = fetchMock;

      const data = await requestCompletion({ model: "m", messages: [] });

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).stream).toBe(false);
      expect(data.choices[0].message.content).toBe("hi there");
    });
  });

  describe("extractCompletionText", () => {
    it("returns the assistant text when present", () => {
      expect(
        extractCompletionText({
          choices: [{ message: { content: "answer" } }],
        }),
      ).toBe("answer");
    });

    it("returns null for missing or non-string content", () => {
      expect(extractCompletionText(null)).toBeNull();
      expect(extractCompletionText({})).toBeNull();
      expect(
        extractCompletionText({ choices: [{ message: { content: 42 } }] }),
      ).toBeNull();
    });
  });
});
