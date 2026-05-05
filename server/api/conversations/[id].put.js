import { defineEventHandler, readBody } from "h3";
import { getClient } from "../../db/index.js";

/**
 * PUT /api/conversations/:id
 * Updates a conversation (messages, title, branch_path, pinned).
 * Body: { user_id, title?, messages?, branch_path?, pinned? }
 */
export default defineEventHandler(async (event) => {
  const conversationId = event.context.params.id;
  const body = await readBody(event);
  const { user_id, title, messages, branch_path, pinned } = body;

  if (!user_id) {
    event.node.res.statusCode = 400;
    return { error: "user_id is required" };
  }

  const client = await getClient();

  try {
    await client.query("BEGIN");

    // Verify ownership
    const existing = await client.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, user_id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      event.node.res.statusCode = 404;
      return { error: "Conversation not found" };
    }

    // Build dynamic update
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

    values.push(conversationId);
    await client.query(
      `UPDATE conversations SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    // Replace messages if provided
    if (messages && Array.isArray(messages)) {
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

    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[API] Error updating conversation:", error);
    event.node.res.statusCode = 500;
    return { error: "Failed to update conversation" };
  } finally {
    client.release();
  }
});
