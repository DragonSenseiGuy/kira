import { defineEventHandler, getQuery } from "h3";
import { query } from "../../db/index.js";

/**
 * GET /api/conversations?user_id=<uuid>
 * Returns conversation metadata list for a user, sorted by last_updated desc.
 */
export default defineEventHandler(async (event) => {
  const { user_id } = getQuery(event);

  if (!user_id) {
    event.node.res.statusCode = 400;
    return { error: "user_id query parameter is required" };
  }

  try {
    const result = await query(
      `SELECT id, title, pinned, created_at, last_updated
       FROM conversations
       WHERE user_id = $1
       ORDER BY last_updated DESC`,
      [user_id]
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
    event.node.res.statusCode = 500;
    return { error: "Failed to fetch conversations" };
  }
});
