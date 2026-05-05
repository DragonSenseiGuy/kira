import { defineEventHandler, readBody } from "h3";
import { getClient } from "../../db/index.js";

/**
 * POST /api/conversations
 * Creates a new conversation with messages.
 * Body: { user_id, id?, title?, messages[], branch_path? }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { user_id, id, title, messages, branch_path } = body;

  if (!user_id) {
    event.node.res.statusCode = 400;
    return { error: "user_id is required" };
  }

  if (!messages || !Array.isArray(messages)) {
    event.node.res.statusCode = 400;
    return { error: "messages array is required" };
  }

  const conversationId = id || crypto.randomUUID();
  const conversationTitle = title || "Untitled";
  const now = new Date().toISOString();

  const client = await getClient();

  try {
    await client.query("BEGIN");

    // Ensure user exists
    await client.query(
      `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [user_id]
    );

    // Create conversation
    await client.query(
      `INSERT INTO conversations (id, user_id, title, branch_path, created_at, last_updated)
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         branch_path = EXCLUDED.branch_path,
         last_updated = EXCLUDED.last_updated`,
      [conversationId, user_id, conversationTitle, JSON.stringify(branch_path || []), now]
    );

    // Insert messages
    if (messages.length > 0) {
      await insertMessages(client, conversationId, messages);
    }

    await client.query("COMMIT");

    return {
      id: conversationId,
      title: conversationTitle,
      createdAt: now,
      lastUpdated: now,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[API] Error creating conversation:", error);
    event.node.res.statusCode = 500;
    return { error: "Failed to create conversation" };
  } finally {
    client.release();
  }
});

async function insertMessages(client, conversationId, messages) {
  // Delete existing messages for this conversation (full replace)
  await client.query(`DELETE FROM messages WHERE conversation_id = $1`, [
    conversationId,
  ]);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    await client.query(
      `INSERT INTO messages (
        id, conversation_id, role, content, timestamp, complete,
        parent_id, branch_index, attachments,
        reasoning, reasoning_start_time, reasoning_end_time, reasoning_duration,
        tool_calls, api_call_time, first_token_time, completion_time,
        token_count, total_tokens, prompt_tokens,
        annotations, parts, tool_call_id, tool_name, position
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23, $24, $25
      )`,
      [
        msg.id,
        conversationId,
        msg.role,
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        msg.timestamp || new Date().toISOString(),
        msg.complete !== false,
        msg.parentId || null,
        msg.branchIndex || 0,
        msg.attachments ? JSON.stringify(msg.attachments) : null,
        msg.reasoning || null,
        msg.reasoningStartTime || null,
        msg.reasoningEndTime || null,
        msg.reasoningDuration || null,
        msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
        msg.apiCallTime || null,
        msg.firstTokenTime || null,
        msg.completionTime || null,
        msg.tokenCount || null,
        msg.totalTokens || null,
        msg.promptTokens || null,
        msg.annotations ? JSON.stringify(msg.annotations) : null,
        msg.parts ? JSON.stringify(msg.parts) : null,
        msg.tool_call_id || null,
        msg.name || null,
        i,
      ]
    );
  }
}
