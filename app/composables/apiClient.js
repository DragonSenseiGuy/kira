/**
 * @file apiClient.js
 * @description Single shared client for the app's server-side AI proxy routes.
 *
 * All LLM traffic goes through Nuxt server routes (`/api/ai`, etc.) which
 * relay to the upstream provider. This module centralizes what every caller
 * previously re-implemented by hand:
 *   - session-token acquisition and header injection
 *   - BYOK key transport via the `x-api-key` header (never logged, never
 *     persisted server-side)
 *   - consistent error normalization into `ApiRequestError`
 *
 * Streaming consumers get the raw `Response`; simple callers use
 * `requestCompletion()` which returns the parsed JSON body.
 */

import { getSessionToken } from "~/composables/useSession";

/** Header used to transport the user's own API key (BYOK). */
export const API_KEY_HEADER = "x-api-key";

/** Header used to transport the short-lived session token. */
export const SESSION_TOKEN_HEADER = "x-session-token";

/**
 * Normalized error for any failed proxy request.
 * `status` is the HTTP status code, `type` mirrors the upstream error type.
 */
export class ApiRequestError extends Error {
  constructor(message, { status = 0, type = "api_error", cause } = {}) {
    super(message, { cause });
    this.name = "ApiRequestError";
    this.status = status;
    this.type = type;
  }
}

/**
 * Builds authenticated headers for a proxy request.
 * @param {string} [apiKey]  User-provided BYOK key (optional).
 * @returns {Promise<Object>} Headers including the session token.
 */
export async function buildProxyHeaders(apiKey) {
  const headers = {
    "Content-Type": "application/json",
    [SESSION_TOKEN_HEADER]: await getSessionToken(),
  };
  if (apiKey) {
    headers[API_KEY_HEADER] = apiKey;
  }
  return headers;
}

/** Statuses worth an automatic retry: upstream blips, not our mistakes. */
const RETRYABLE_STATUSES = new Set([500, 502, 503, 529]);

/** Total attempts per request (first try + retries). */
const MAX_REQUEST_ATTEMPTS = 3;

/**
 * Replaces lone surrogates so a string always encodes to valid UTF-8.
 * Uses the ES2024 builtin when available, else an encoder round-trip
 * (TextEncoder already substitutes unpaired surrogates with U+FFFD).
 */
export function toWellFormedText(text) {
  if (typeof text !== "string") return text;
  if (typeof text.toWellFormed === "function") return text.toWellFormed();
  return new TextDecoder().decode(new TextEncoder().encode(text));
}

/**
 * Abort-aware sleep used between retry attempts.
 */
function sleepWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };
    const cleanup = () => clearTimeout(timer);
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Extracts a human-readable message + type from an error response body.
 * @param {Response} response
 * @returns {Promise<{message: string, type: string}>}
 */async function extractErrorBody(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Body was not JSON (e.g. HTML error page) — fall through.
  }
  return {
    message:
      data?.error?.message ||
      data?.error ||
      data?.statusMessage ||
      `API request failed with status ${response.status}`,
    type: data?.error?.type || "api_error",
  };
}

/**
 * POSTs a chat-completion payload.
 *
 * Two transports:
 *   1. Default — relayed through our `/api/ai` server route (session
 *      token + BYOK key header). Used for Hack Club and remote custom
 *      providers (avoids CORS).
 *   2. Direct — when the payload carries `directBaseUrl` (loopback
 *      providers like Ollama/LM Studio), the BROWSER calls
 *      `${directBaseUrl}/chat/completions` itself with a Bearer key.
 *      This is what makes local runtimes work even when the site is
 *      hosted remotely.
 *
 * The payload may carry `customApiKey`, which becomes the auth credential
 * for whichever transport applies and never appears in a relayed body.
 *
 * @param {Object} payload  OpenAI-compatible completion parameters.
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Response>} The raw response (caller streams or parses).
 * @throws {ApiRequestError} On non-2xx responses.
 */
export async function postChatCompletion(payload, { signal } = {}) {
  const { customApiKey, directBaseUrl, ...body } = payload || {};
  const base = directBaseUrl ? String(directBaseUrl).replace(/\/+$/, "") : null;

  // Serialize once, well-formed: sandboxed tool results can carry lone
  // surrogates, which JSON.stringify happily embeds — producing an invalid
  // UTF-8 body that gateways answer with an opaque 502. toWellFormed
  // (ES2024) or an encoder round-trip replaces them with U+FFFD.
  const jsonBody = toWellFormedText(JSON.stringify(body));

  let lastNetworkError = null;

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
    let response;
    try {
      if (base) {
        response = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(customApiKey ? { Authorization: `Bearer ${customApiKey}` } : {}),
          },
          body: jsonBody,
          signal,
        });
      } else {
        response = await fetch("/api/ai", {
          method: "POST",
          headers: await buildProxyHeaders(customApiKey),
          body: jsonBody,
          signal,
        });
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      lastNetworkError = error;
      if (attempt < MAX_REQUEST_ATTEMPTS) {
        await sleepWithAbort(900 * attempt, signal);
        continue;
      }
      if (base) {
        throw new ApiRequestError(
          `Could not reach ${base} — is the local runtime running and CORS enabled?`,
          { cause: error },
        );
      }
      throw new ApiRequestError(
        `Failed to reach the AI service: ${error?.message || error}`,
        { cause: error },
      );
    }

    // Transient upstream failures (provider blips, gateway overload) are
    // common on relays — especially with large tool-result payloads. Retry
    // before the stream is consumed, so nothing partial is exposed.
    if (!response.ok && RETRYABLE_STATUSES.has(response.status) && attempt < MAX_REQUEST_ATTEMPTS) {
      await sleepWithAbort(900 * attempt, signal);
      continue;
    }

    if (!response.ok) {
      const { message, type } = await extractErrorBody(response);
      throw new ApiRequestError(message, { status: response.status, type });
    }

    return response;
  }

  // Not reachable (loop always returns or throws), kept for exhaustiveness.
  throw new ApiRequestError("AI request failed after retries", { status: 502 });
}

/**
 * Requests a non-streaming completion and returns the parsed JSON body
 * (an OpenAI chat-completion object with a `choices` array).
 *
 * @param {Object} payload  Completion parameters (`stream` forced to false).
 * @param {Object} [options]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Object>} Parsed completion response.
 * @throws {ApiRequestError}
 */
export async function requestCompletion(payload, { signal } = {}) {
  const response = await postChatCompletion(
    { ...payload, stream: false },
    { signal },
  );
  try {
    return await response.json();
  } catch (error) {
    throw new ApiRequestError("AI service returned an invalid JSON body", {
      status: response.status,
      cause: error,
    });
  }
}

/**
 * Convenience helper: returns just the assistant message text from a
 * non-streaming completion response, or null when absent.
 *
 * @param {Object} completionData  Parsed completion response.
 * @returns {string|null}
 */
export function extractCompletionText(completionData) {
  const content = completionData?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}
