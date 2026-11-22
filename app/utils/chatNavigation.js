/**
 * The chat one step above or below the open one, in the order the sidebar
 * shows them. From a screen with no chat open, "next" is the first chat.
 * Stops at either end instead of wrapping.
 *
 * @param {{ key: string, conversations: { id: string }[] }[]} groups Sidebar groups, top to bottom.
 * @param {string|undefined} currentId Id of the open chat, if any.
 * @param {1|-1} step 1 for the chat below, -1 for the one above.
 * @param {boolean} [pinnedExpanded] False when the pinned group is collapsed and its chats are hidden.
 * @returns {string|null} The chat to open, or null when there is none.
 */
export function adjacentChatId(groups, currentId, step, pinnedExpanded = true) {
  const ids = groups
    .filter((group) => pinnedExpanded || group.key !== "pinned")
    .flatMap((group) => group.conversations.map((conversation) => conversation.id));
  const index = ids.indexOf(currentId);
  if (index === -1) return step === 1 ? ids[0] ?? null : null;
  return ids[index + step] ?? null;
}
