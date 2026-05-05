import { defineEventHandler, getQuery } from "h3";
import { query } from "../../db/index.js";

/**
 * GET /api/conversations/:id?user_id=<uuid>
 * Returns a full conversation with all messages.
 */
export default defineEventHandler(async (event) => {
  const conversationId = event.context.params.id;
  const { user_id } = getQuery(event);

  if (!user_id) {
    event.node.res.statusCode = 400;
    return { error: "user_id query parameter is required" };
  }

  try {
    // Fetch conversation
    const convResult = await query(
      `SELECT id, title, pinned, branch_path, created_at, last_updated
       FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [conversationId, user_id]
    );

    if (convResult.rows.length === 0) {
      event.node.res.statusCode = 404;
      return { error: "Conversation not found" };
    }

    const conv = convResult.rows[0];

    // Fetch messages ordered by position
    const msgResult = await query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY position ASC`,
      [conversationId]
    );

    const messages = msgResult.rows.map((row) => {
      const msg = {
        id: row.id,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        complete: row.complete,
        parentId: row.parent_id,
        branchIndex: row.branch_index,
      };

      if (row.role === "user" && row.attachments) {
        msg.attachments = row.attachments;
      }

      if (row.role === "assistant") {
        msg.reasoning = row.reasoning;
        msg.reasoningStartTime = row.reasoning_start_time;
        msg.reasoningEndTime = row.reasoning_end_time;
        msg.reasoningDuration = row.reasoning_duration;
        msg.tool_calls = row.tool_calls || [];
        msg.apiCallTime = row.api_call_time;
        msg.firstTokenTime = row.first_token_time;
        msg.completionTime = row.completion_time;
        msg.tokenCount = row.token_count;
        msg.totalTokens = row.total_tokens;
        msg.promptTokens = row.prompt_tokens;
        msg.annotations = row.annotations;
        msg.parts = row.parts;
      }

      if (row.role === "tool") {
        msg.tool_call_id = row.tool_call_id;
        msg.name = row.tool_name;
      }

      return msg;
    });

    return {
      id: conv.id,
      title: conv.title,
      pinned: conv.pinned,
      branchPath: conv.branch_path || [],
      createdAt: conv.created_at,
      lastUpdated: conv.last_updated,
      messages,
    };
  } catch (error) {
    console.error("[API] Error fetching conversation:", error);
    event.node.res.statusCode = 500;
    return { error: "Failed to fetch conversation" };
  }
});
