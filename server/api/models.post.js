import { defineEventHandler, getHeader, readBody, createError } from 'h3';
import { validateUpstreamBaseUrl, joinUpstreamPath } from '../utils/upstream';

/**
 * Relays GET {baseUrl}/models for custom OpenAI-compatible providers.
 * The base URL comes from the client (user-configured provider) and is
 * validated against SSRF rules; the provider's API key travels in the
 * x-api-key header and is forwarded as a Bearer token.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const apiKey = getHeader(event, 'x-api-key');

  if (!apiKey) {
    throw createError({
      statusCode: 401,
      statusMessage: 'API key is required in the x-api-key header.'
    });
  }

  const baseUrl = validateUpstreamBaseUrl(body?.baseUrl);
  if (!baseUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'The provided endpoint URL is not allowed.'
    });
  }

  try {
    const response = await fetch(joinUpstreamPath(baseUrl, 'models'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body?.baseUrl && /openrouter\.ai$/i.test(new URL(baseUrl).hostname)
          ? { 'HTTP-Referer': 'https://github.com/DragonSenseiGuy/kira', 'X-Title': 'Kira' }
          : {})
      }
    });

    if (!response.ok) {
      throw createError({
        statusCode: response.status === 401 || response.status === 403 ? 401 : 502,
        statusMessage:
          response.status === 401 || response.status === 403
            ? 'The provider rejected this API key.'
            : `Provider returned ${response.status} while listing models.`
      });
    }

    const data = await response.json();
    // OpenAI-compatible /models responses use { data: [...] }; pass through
    // as-is so the client can read whatever extra metadata it understands.
    return data;
  } catch (error) {
    if (error?.statusCode) throw error;
    console.error('Model list relay failed:', error);
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not reach the provider to list models.'
    });
  }
});
