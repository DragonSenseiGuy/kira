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
  ApiRequestError,
} from "../app/composables/apiClient.js";

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
