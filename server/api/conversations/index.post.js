import { createError, defineEventHandler, readBody } from "h3";
import { getClient } from "../../db/index.js";
import { requireDatabase, requireUserId } from "../../utils/account";
import { replaceMessages } from "../../utils/messages";

/**
 * POST /api/conversations
 * Creates (or upserts) a conversation owned by the signed-in user.
 * Body: { id?, title?, messages[], branch_path? }
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);
  const userId = requireUserId(event);

  const body = await readBody(event);
  const { id, title, messages, branch_path } = body || {};

  if (!messages || !Array.isArray(messages)) {
    throw createError({
      statusCode: 400,
      statusMessage: "messages array is required",
    });
  }

  const conversationId = id || crypto.randomUUID();
  const conversationTitle = title || "Untitled";
  const now = new Date().toISOString();

  const client = await getClient();

  try {
    await client.query("BEGIN");

    // The WHERE clause makes the upsert a no-op for a conversation id that
    // belongs to somebody else.
    const upserted = await client.query(
      `INSERT INTO conversations (id, user_id, title, branch_path, created_at, last_updated)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         branch_path = EXCLUDED.branch_path,
         last_updated = EXCLUDED.last_updated
       WHERE conversations.user_id = $2
       RETURNING id`,
      [
        conversationId,
        userId,
        conversationTitle,
        JSON.stringify(branch_path || []),
        now,
      ]
    );

    if (upserted.rowCount === 0) {
      await client.query("ROLLBACK");
      throw createError({ statusCode: 403, statusMessage: "Not your conversation" });
    }

    await replaceMessages(client, conversationId, messages);

    await client.query("COMMIT");

    return {
      id: conversationId,
      title: conversationTitle,
      createdAt: now,
      lastUpdated: now,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.statusCode) throw error;
    console.error("[API] Error creating conversation:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create conversation",
    });
  } finally {
    client.release();
  }
});
