import { defineEventHandler } from "h3";
import { requireDatabase, requireUserId } from "../../utils/account";
import { getUserApiKey, maskApiKey } from "../../utils/apiKeys";

/**
 * GET /api/account/api-key
 * Returns the signed-in user's own API key so a new device can pick up where
 * the last one left off. Only ever returned to the key's owner.
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);

  const apiKey = await getUserApiKey(event, userId);

  return {
    hasKey: !!apiKey,
    apiKey: apiKey || "",
    preview: apiKey ? maskApiKey(apiKey) : "",
  };
});
