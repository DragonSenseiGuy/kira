import { createError, defineEventHandler, readBody } from "h3";
import { getClient } from "../../db/index.js";
import { requireDatabase, requireUserId } from "../../utils/account";
import { replaceMessages } from "../../utils/messages";

/**
 * PUT /api/conversations/:id
 * Updates one of the signed-in user's conversations.
 * Body: { title?, messages?, branch_path?, pinned? }
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);
  const conversationId = event.context.params.id;

  const body = await readBody(event);
  const { title, messages, branch_path, pinned } = body || {};

  const client = await getClient();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      throw createError({
        statusCode: 404,
        statusMessage: "Conversation not found",
      });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (branch_path !== undefined) {
      updates.push(`branch_path = $${paramIndex++}`);
      values.push(JSON.stringify(branch_path));
    }
    if (pinned !== undefined) {
      updates.push(`pinned = $${paramIndex++}`);
      values.push(pinned);
    }

    updates.push(`last_updated = $${paramIndex++}`);
    values.push(new Date().toISOString());

    values.push(conversationId, userId);
    await client.query(
      `UPDATE conversations SET ${updates.join(", ")}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}`,
      values
    );

    if (messages && Array.isArray(messages)) {
      await replaceMessages(client, conversationId, messages);
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.statusCode) throw error;
    console.error("[API] Error updating conversation:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update conversation",
    });
  } finally {
    client.release();
  }
});
