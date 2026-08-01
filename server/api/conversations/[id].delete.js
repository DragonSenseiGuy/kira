import { createError, defineEventHandler } from "h3";
import { query } from "../../db/index.js";
import { requireDatabase, requireUserId } from "../../utils/account";

/**
 * DELETE /api/conversations/:id
 * Deletes one of the signed-in user's conversations (messages cascade).
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);
  const conversationId = event.context.params.id;

  try {
    const result = await query(
      `DELETE FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (result.rowCount === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Conversation not found",
      });
    }

    return { success: true };
  } catch (error) {
    if (error.statusCode) throw error;
    console.error("[API] Error deleting conversation:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete conversation",
    });
  }
});
