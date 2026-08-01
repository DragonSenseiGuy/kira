/**
 * Shared message row mapping for the conversations endpoints.
 */

const INSERT_MESSAGE_SQL = `
  INSERT INTO messages (
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
  )`;

/**
 * Replaces every message in a conversation with the given list.
 * Must run inside a transaction.
 * @param {import('pg').PoolClient} client
 * @param {string} conversationId
 * @param {Array<object>} messages
 */
export async function replaceMessages(client, conversationId, messages) {
  await client.query(`DELETE FROM messages WHERE conversation_id = $1`, [
    conversationId,
  ]);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    await client.query(INSERT_MESSAGE_SQL, [
      msg.id,
      conversationId,
      msg.role,
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content),
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
    ]);
  }
}

/**
 * Maps a messages row back into the shape the client stores locally.
 * @param {object} row
 * @returns {object}
 */
export function rowToMessage(row) {
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
}
