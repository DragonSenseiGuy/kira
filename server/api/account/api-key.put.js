import { createError, defineEventHandler, readBody } from "h3";
import { requireDatabase, requireUserId } from "../../utils/account";
import { maskApiKey, setUserApiKey } from "../../utils/apiKeys";

// Long enough to catch obvious mistakes, loose enough not to guess at the
// shape of keys the proxy might accept.
const MAX_API_KEY_LENGTH = 512;

/**
 * PUT /api/account/api-key
 * Saves the signed-in user's API key, encrypted at rest.
 * Body: { apiKey }
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);

  const body = await readBody(event);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : null;

  if (apiKey === null) {
    throw createError({
      statusCode: 400,
      statusMessage: "apiKey is required",
    });
  }

  if (apiKey.length > MAX_API_KEY_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: `API key must be at most ${MAX_API_KEY_LENGTH} characters`,
    });
  }

  // An empty string is how the settings panel clears a key.
  await setUserApiKey(event, userId, apiKey || null);

  return {
    hasKey: !!apiKey,
    preview: apiKey ? maskApiKey(apiKey) : "",
  };
});
