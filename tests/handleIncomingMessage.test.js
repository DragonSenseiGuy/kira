/**
 * Tests for app/composables/message.js -> handleIncomingMessage
 *
 * Integration test of the streaming agent loop with mocked fetch:
 *   - Yields content chunks as they stream in
 *   - Yields reasoning chunks
 *   - Aborts surface a "STREAM CANCELED" yield
 *   - Missing required params are rejected immediately
 *   - Tool-call deltas are forwarded as tool_calls yields
 *
 * Approach:
 *   - vi.mock to stub upstream modules (systemPrompt, toolsManager, useSession)
 *   - vi.resetModules() in beforeEach so imports are fresh for every test
 *   - Stub globalThis.fetch with a URL-based implementation
 *   - Drive the async generator and collect its yields
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// --- Shared hoisted state (vi.mock factories are hoisted above imports) ---

const mocks = vi.hoisted(() => ({
  toolManager: {
    getSchemasByNames: vi.fn(() => []),
    getTool: vi.fn(),
  },
}));

// --- Module-level mocks ---

vi.mock("../app/composables/systemPrompt", () => ({
  generateSystemPrompt: vi.fn(async () => "You are a test assistant."),
}));

vi.mock("../app/composables/toolsManager", () => ({
  toolManager: mocks.toolManager,
  ToolManager: class {},
}));

vi.mock("../app/composables/useSession", () => ({
  getSessionToken: vi.fn(async () => "test-session-token"),
}));

// --- Helpers ---

function makeSseStream(chunks) {
  const encoder = new TextEncoder();
  const encoded = chunks.map((c) => encoder.encode(c));
  let i = 0;
  return {
    getReader() {
      return {
        read: async () => {
          if (i >= encoded.length) return { done: true, value: undefined };
          return { done: false, value: encoded[i++] };
        },
        releaseLock: () => {},
        cancel: async () => {},
      };
    },
  };
}

const ABORT_ERROR = (() => {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
})();

/**
 * Install a fetch mock. `streamFn(callIndex)` returns the SSE chunk array
 * for each successive /api/ai call. The returned value `"ABORT"` is a
 * sentinel for an AbortError-throwing reader.
 */
function installRoutedFetch(streamFn) {
  let streamCallIndex = 0;
  globalThis.fetch = vi.fn(async () => {
    const chunks = streamFn(streamCallIndex++);
    if (chunks === "ABORT") {
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockRejectedValue(ABORT_ERROR),
            releaseLock: vi.fn(),
            cancel: vi.fn(),
          }),
        },
      };
    }
    return { ok: true, body: makeSseStream(chunks) };
  });
}

// --- Tests ---

describe("handleIncomingMessage", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.toolManager.getSchemasByNames.mockReturnValue([]);
    mocks.toolManager.getTool.mockReset();
  });

  afterEach(() => {
    delete globalThis.fetch;
    vi.clearAllMocks();
  });

  // Helper: only INCREMENTAL content yields (excludes the final complete yield)
  function incrementalContent(chunks) {
    return chunks
      .filter((c) => c.content !== undefined && c.content !== null && !c.complete)
      .map((c) => c.content);
  }

  it("rejects when required parameters are missing", async () => {
    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage(null, [], new AbortController())) {
      chunks.push(c);
    }

    const err = chunks.find((c) => c.error);
    expect(err).toBeDefined();
    expect(err.errorDetails.message).toMatch(/missing/i);
  });

  it("yields content chunks from a plain text stream", async () => {
    installRoutedFetch(() => [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("hi", [], new AbortController())) {
      chunks.push(c);
    }

    expect(incrementalContent(chunks)).toEqual(["Hello", " world"]);

    const final = chunks.find((c) => c.complete);
    expect(final.content).toBe("Hello world");
  });

  it("yields reasoning chunks when the API returns reasoning deltas", async () => {
    installRoutedFetch(() => [
      'data: {"choices":[{"delta":{"reasoning":"thinking..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController())) {
      chunks.push(c);
    }

    const reasoning = chunks
      .filter((c) => c.reasoning === "thinking...")
      .map((c) => c.reasoning);
    expect(reasoning.length).toBeGreaterThan(0);
    expect(incrementalContent(chunks)).toContain("answer");
  });

  it("yields a dedicated canceled event when the controller is aborted", async () => {
    installRoutedFetch(() => "ABORT");

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController())) {
      chunks.push(c);
    }

    const canceled = chunks.find((c) => c.canceled);
    expect(canceled).toBeDefined();
    expect(canceled.complete).toBe(true);
    // Cancellation must never ride as content text.
    expect(canceled.content).toBeNull();
  });

  it("yields a tool_calls chunk when the stream contains a tool_call delta", async () => {
    // The tool-call stream is served ONCE; any follow-up iteration gets a
    // plain terminating stream so the agent loop ends instead of looping
    // forever now that tool iterations are unlimited by default.
    let callIndex = 0;
    globalThis.fetch = vi.fn(async () => {
      if (callIndex++ === 0) {
        return {
          ok: true,
          body: makeSseStream([
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":"{\\"q\\":\\"hello\\"}"}}]}}]}\n\n',
            'data: [DONE]\n\n',
          ]),
        };
      }
      return {
        ok: true,
        body: makeSseStream([
          'data: {"choices":[{"delta":{"content":"finished"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      };
    });

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController())) {
      chunks.push(c);
    }

    // The function should yield at least one chunk with tool_calls set
    const toolCallChunks = chunks.filter((c) => c.tool_calls);
    expect(toolCallChunks.length).toBeGreaterThan(0);
    expect(toolCallChunks[0].tool_calls[0].id).toBe("call_1");
  });

  // --- Error deduplication contract ---
  //
  // Regression tests for the "error appended three times" bug. The
  // contract is now: an in-stream failure produces EXACTLY ONE structured
  // error event; error text is NEVER embedded in `content` (the UI layer
  // renders the single canonical error block from errorDetails).

  it("emits exactly ONE error event when the stream reports an error", async () => {
    installRoutedFetch(() => [
      'data: {"choices":[{"delta":{"content":"partial answer"}}]}\n\n',
      'data: {"error":{"type":"server_error","message":"upstream exploded"}}\n\n',
      'data: [DONE]\n\n',
    ]);

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController())) {
      chunks.push(c);
    }

    const errorChunks = chunks.filter((c) => c.error === true);
    expect(errorChunks).toHaveLength(1);

    const err = errorChunks[0];
    expect(err.errorDetails.message).toBe("upstream exploded");
    expect(err.errorDetails.name).toBe("server_error");
    expect(err.complete).toBe(true);

    // No error text may leak into content — the old bug appended
    // "[ERROR: ...]" AND "[CRITICAL ERROR: ...]" on top of the UI suffix.
    for (const chunk of chunks) {
      if (typeof chunk.content === "string") {
        expect(chunk.content).not.toContain("[ERROR");
        expect(chunk.content).not.toContain("[CRITICAL ERROR");
      }
    }
  });

  it("emits exactly ONE error event when the proxy responds non-OK", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          type: "authentication_error",
          message: "API key is required.",
          code: 401,
        },
      }),
    }));

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController())) {
      chunks.push(c);
    }

    const errorChunks = chunks.filter((c) => c.error === true);
    expect(errorChunks).toHaveLength(1);
    expect(errorChunks[0].complete).toBe(true);
    expect(errorChunks[0].errorDetails.message).toContain("API key is required");

    for (const chunk of chunks) {
      if (typeof chunk.content === "string") {
        expect(chunk.content).not.toContain("[CRITICAL ERROR");
      }
    }
  });

  it("does not emit error text as content when a mid-stream read fails", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockRejectedValue(new Error("connection reset")),
          releaseLock: vi.fn(),
          cancel: vi.fn(),
        }),
      },
    }));

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController())) {
      chunks.push(c);
    }

    const errorChunks = chunks.filter((c) => c.error === true);
    expect(errorChunks).toHaveLength(1);
    expect(errorChunks[0].content ?? null).toBeNull();
    expect(errorChunks[0].errorDetails.message).toContain("connection reset");
  });

  it("executes multiple independent tool calls and yields each result", async () => {
    mocks.toolManager.getSchemasByNames.mockReturnValue([
      { type: "function", function: { name: "search" } },
    ]);
    mocks.toolManager.getTool.mockImplementation((name) => ({
      executor: async () => ({ tool: name, ok: true }),
    }));

    let callIndex = 0;
    globalThis.fetch = vi.fn(async () => {
      if (callIndex++ === 0) {
        return {
          ok: true,
          body: makeSseStream([
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"search","arguments":"{}"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","function":{"name":"getPageContents","arguments":"{}"}}]}}]}\n\n',
            'data: [DONE]\n\n',
          ]),
        };
      }
      return {
        ok: true,
        body: makeSseStream(['data: {"choices":[{"delta":{"content":"done"}}]}\n\n', "data: [DONE]\n\n"]),
      };
    });

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController(), undefined, {}, {}, ["search"], true)) {
      chunks.push(c);
    }

    const resultYields = chunks
      .filter((c) => c.tool_result)
      .map((c) => JSON.parse(c.tool_result.result));

    expect(resultYields).toHaveLength(2);
    expect(resultYields.map((r) => r.tool)).toEqual(["search", "getPageContents"]);
  });

  // --- Multi-provider routing ---

  it("routes requests to a custom OpenAI-compatible provider for composite model IDs", async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        body: makeSseStream(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', "data: [DONE]\n\n"]),
      };
    });

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const settings = {
      custom_api_key: "hc-key",
      selected_model_id: "pr_custom::my-test-model",
      custom_providers: [
        {
          id: "pr_custom",
          name: "Custom",
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-custom",
        },
      ],
    };

    for await (const c of handleIncomingMessage("q", [], new AbortController(), undefined, {}, settings)) {
      // drain
    }

    expect(calls.length).toBeGreaterThan(0);
    const { init } = calls[0];
    const body = JSON.parse(init.body);

    expect(body.model).toBe("my-test-model"); // provider prefix stripped
    expect(body.upstreamBaseUrl).toBe("https://api.example.com/v1");
    // The BYOK key moved into the header by the shared API client.
    expect(init.headers["x-api-key"]).toBe("sk-custom");
  });

  it("keeps Hack Club routing (no upstream override) for plain model IDs", async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        body: makeSseStream(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', "data: [DONE]\n\n"]),
      };
    });

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const settings = { custom_api_key: "hc-key" };

    for await (const c of handleIncomingMessage("q", [], new AbortController(), undefined, {}, settings)) {
      // drain
    }

    const body = JSON.parse(calls[0].init.body);
    expect(body.upstreamBaseUrl).toBeUndefined();
    expect(calls[0].init.headers["x-api-key"]).toBe("hc-key");
  });

  it("routes LOOPBACK providers as direct browser calls (no relay)", async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        body: makeSseStream(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', "data: [DONE]\n\n"]),
      };
    });

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const settings = {
      active_provider_id: "pr_local",
      selected_model_id: "pr_local::llama3",
      custom_providers: [
        {
          id: "pr_local",
          name: "Ollama",
          baseUrl: "http://localhost:11434/v1",
          apiKey: "",
        },
      ],
    };

    for await (const c of handleIncomingMessage("q", [], new AbortController(), undefined, {}, settings)) {
      // drain
    }

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    // The BROWSER hits the runtime directly — no /api/ai relay.
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init.headers["x-session-token"]).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body.model).toBe("llama3"); // provider prefix stripped
    expect(body.directBaseUrl).toBeUndefined(); // consumed by the client
  });

  // --- Search-tool gating ---

  it("does not execute search tools when tool_search_source is 'off'", async () => {
    // Faithful mock: schemas are requested per enabled tool names. With
    // search off, 'search' must not be among them (the always-on sandbox
    // tools are, but they don't include a search schema).
    mocks.toolManager.getSchemasByNames.mockImplementation((names) =>
      names.includes("search")
        ? [{ type: "function", function: { name: "search" } }]
        : [],
    );
    mocks.toolManager.getTool.mockImplementation(() => ({
      executor: async () => ({ ok: true }),
    }));

    let callIndex = 0;
    globalThis.fetch = vi.fn(async () => {
      if (callIndex++ === 0) {
        return {
          ok: true,
          body: makeSseStream([
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":"{}"}}]}}]}\n\n',
            'data: [DONE]\n\n',
          ]),
        };
      }
      return {
        ok: true,
        body: makeSseStream([
          'data: {"choices":[{"delta":{"content":"done"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      };
    });

    const { handleIncomingMessage } = await import("../app/composables/message.js");
    const settings = { custom_api_key: "k", tool_search_source: "off" };

    const chunks = [];
    for await (const c of handleIncomingMessage("q", [], new AbortController(), undefined, {}, settings, ["search"], true)) {
      chunks.push(c);
    }

    // Tools must never run — no results, and the loop ends without a
    // second API call.
    expect(chunks.filter((c) => c.tool_result)).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
