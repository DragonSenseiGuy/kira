import { createError, defineEventHandler } from "h3";
import { query } from "../../db/index.js";
import { requireDatabase, requireUserId } from "../../utils/account";
import { rowToMessage } from "../../utils/messages";

/**
 * GET /api/conversations/:id
 * Returns one of the signed-in user's conversations, with all messages.
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);
  const conversationId = event.context.params.id;

  try {
    const convResult = await query(
      `SELECT id, title, pinned, branch_path, created_at, last_updated
       FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Conversation not found",
      });
    }

    const conv = convResult.rows[0];

    const msgResult = await query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY position ASC`,
      [conversationId]
    );

    return {
      id: conv.id,
      title: conv.title,
      pinned: conv.pinned,
      branchPath: conv.branch_path || [],
      createdAt: conv.created_at,
      lastUpdated: conv.last_updated,
      messages: msgResult.rows.map(rowToMessage),
    };
  } catch (error) {
    if (error.statusCode) throw error;
    console.error("[API] Error fetching conversation:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch conversation",
    });
  }
});
