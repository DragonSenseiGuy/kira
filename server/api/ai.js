import { defineEventHandler, getHeader, readBody } from 'h3';
import OpenAI from 'openai';
import { resolveApiKey } from '../utils/apiKeys';
import { validateUpstreamBaseUrl } from '../utils/upstream';

const UPSTREAM_BASE_URL = 'https://ai.hackclub.com/proxy/v1';

/**
 * Sends a JSON error response, guarding against headers already being
 * flushed (mid-stream failures must stay in the SSE channel instead).
 */
function sendJsonError(event, statusCode, payload) {
  const res = event.node.res;
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  // BYOK: the user's own API key travels in the x-api-key header. Falling back
  // to the key saved on their account is what makes a new device work.
  const apiKey = await resolveApiKey(event, getHeader(event, 'x-api-key'));

  if (!apiKey) {
    sendJsonError(event, 401, {
      error: {
        type: 'authentication_error',
        message: 'API key is required. Please add your own API key in settings.',
        code: 401
      }
    });
    return;
  }

  try {
    const {
      stream = true,
      // Custom OpenAI-compatible upstream (multi-provider). Validated
      // against SSRF rules; when absent, traffic goes to Hack Club.
      upstreamBaseUrl,
      ...rest
    } = body;

    const baseURL = upstreamBaseUrl
      ? validateUpstreamBaseUrl(upstreamBaseUrl)
      : UPSTREAM_BASE_URL;

    if (upstreamBaseUrl && !baseURL) {
      sendJsonError(event, 400, {
        error: {
          type: 'invalid_request_error',
          message: 'The provided endpoint URL is not allowed.',
          code: 400
        }
      });
      return;
    }

    const openai = new OpenAI({
      apiKey,
      baseURL
    });

    // Whitelisted core fields; allow pass-through of others
    const completionParams = {
      ...rest,
      stream
      // rest may include: model, messages, tools, tool_choice,
      // parallel_tool_calls, temperature, top_p, seed, reasoning, plugins, etc.
    };

    if (!stream) {
      const completion = await openai.chat.completions.create({
        ...completionParams,
        stream: false,
      });

      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.end(JSON.stringify(completion));
      return;
    }

    // Streaming branch. Flush headers immediately so the client sees the
    // connection as established while the upstream call is still in flight.
    const res = event.node.res;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();

    const streamResp = await openai.chat.completions.create({
      ...completionParams,
      stream: true,
    });

    for await (const chunk of streamResp) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error creating chat completion:', error);

    const errorPayload = {
      error: {
        type: error.type || 'api_error',
        message: error.message || 'Failed to connect to AI service',
        code: error.status || 500
      }
    };

    // If the response already started (mid-stream failure), surface the
    // error inside the SSE channel; otherwise send a proper status code.
    if (event.node.res.headersSent) {
      event.node.res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
      event.node.res.write('data: [DONE]\n\n');
      event.node.res.end();
    } else {
      sendJsonError(event, error.status || 500, errorPayload);
    }
  }
});
