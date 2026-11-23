/**
 * @file conversationMetadata.js
 * @description Helpers for the `conversations_metadata` list.
 */

export function getConversationCreatedAt(conversation) {
  if (conversation.createdAt) return conversation.createdAt;

  let earliest = Infinity;
  for (const message of conversation.messages ?? []) {
    if (message.timestamp == null) continue;
    const time = new Date(message.timestamp).getTime();
    if (time < earliest) earliest = time;
  }

  return Number.isFinite(earliest) ? new Date(earliest).toISOString() : conversation.lastUpdated;
}

/**
 * Applies changed fields to conversation entries, keeping whatever else an
 * entry already carries (pinned, archived, createdAt, ...). Entries for
 * unknown ids are appended.
 *
 * @param {Array<Object>} metadata  Current stored list.
 * @param {Array<Object>} entries   Entries with an `id` and the fields to set.
 * @returns {Array<Object>} A new list.
 */
export function mergeMetadataEntries(metadata, entries) {
  const result = (metadata || []).map((entry) => ({ ...entry }));
  const byId = new Map(result.map((entry) => [entry.id, entry]));
  for (const entry of entries || []) {
    const existing = byId.get(entry.id);
    if (existing) {
      Object.assign(existing, entry);
    } else {
      const added = { ...entry };
      result.push(added);
      byId.set(added.id, added);
    }
  }
  return result;
}
