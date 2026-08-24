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

/**
 * Extracts a human-readable message + type from an error response body.
 * @param {Response} response
 * @returns {Promise<{message: string, type: string}>}
 */
async function extractErrorBody(response) {
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

  let response;
  try {
    if (directBaseUrl) {
      const base = String(directBaseUrl).replace(/\/+$/, "");
      response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(customApiKey ? { Authorization: `Bearer ${customApiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } else {
      response = await fetch("/api/ai", {
        method: "POST",
        headers: await buildProxyHeaders(customApiKey),
        body: JSON.stringify(body),
        signal,
      });
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    if (directBaseUrl) {
      throw new ApiRequestError(
        `Could not reach ${directBaseUrl} — is the local runtime running and CORS enabled?`,
        { cause: error },
      );
    }
    throw new ApiRequestError(
      `Failed to reach the AI service: ${error?.message || error}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    const { message, type } = await extractErrorBody(response);
    throw new ApiRequestError(message, { status: response.status, type });
  }

  return response;
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
