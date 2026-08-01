import { createError, defineEventHandler } from "h3";
import { query } from "../../db/index.js";
import { requireDatabase, requireUserId } from "../../utils/account";

/**
 * GET /api/conversations
 * Returns the signed-in user's conversation metadata, newest first.
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);

  try {
    const result = await query(
      `SELECT id, title, pinned, created_at, last_updated
       FROM conversations
       WHERE user_id = $1
       ORDER BY last_updated DESC`,
      [userId]
    );

    return {
      conversations: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        pinned: row.pinned,
        createdAt: row.created_at,
        lastUpdated: row.last_updated,
      })),
    };
  } catch (error) {
    console.error("[API] Error fetching conversations:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch conversations",
    });
  }
});
