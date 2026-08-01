import { defineEventHandler } from "h3";
import { requireDatabase, requireUserId } from "../../utils/account";
import { setUserApiKey } from "../../utils/apiKeys";

/**
 * DELETE /api/account/api-key
 * Removes the signed-in user's stored API key.
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);

  await setUserApiKey(event, userId, null);

  return { hasKey: false };
});
