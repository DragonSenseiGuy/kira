import { defineEventHandler, readBody } from "h3";
import { query } from "../../db/index.js";

/**
 * DELETE /api/conversations/:id
 * Deletes a conversation and all its messages (cascading).
 * Body: { user_id }
 */
export default defineEventHandler(async (event) => {
  const conversationId = event.context.params.id;
  const body = await readBody(event);
  const { user_id } = body;

  if (!user_id) {
    event.node.res.statusCode = 400;
    return { error: "user_id is required" };
  }

  try {
    const result = await query(
      `DELETE FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, user_id]
    );

    if (result.rowCount === 0) {
      event.node.res.statusCode = 404;
      return { error: "Conversation not found" };
    }

    return { success: true };
  } catch (error) {
    console.error("[API] Error deleting conversation:", error);
    event.node.res.statusCode = 500;
    return { error: "Failed to delete conversation" };
  }
});
