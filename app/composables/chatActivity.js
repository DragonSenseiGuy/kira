import { reactive } from "vue";

/**
 * Which chats have a reply being generated, and which got one while the
 * user was looking at another chat. Shared by the chat pages and the sidebar;
 * a reply keeps generating after its page is left.
 */
const state = reactive({ generating: {}, unread: {} });

// Chats the user navigated away from while their reply was generating. Going
// back does not attach the page to that reply, so it still counts as unseen.
const left = {};

/** @param {string|null} id */
export function markReplyStarted(id) {
  if (!id) return;
  state.generating[id] = (state.generating[id] || 0) + 1;
  delete state.unread[id];
}

/**
 * @param {string|null} id
 * @param {boolean} isOpen Whether that chat is the one on screen.
 */
export function markReplyFinished(id, isOpen) {
  if (!id || !state.generating[id]) return;
  if (state.generating[id] > 1) state.generating[id] -= 1;
  else delete state.generating[id];
  if (!isOpen || left[id]) state.unread[id] = true;
  if (!state.generating[id]) delete left[id];
}

/** @param {string|null|undefined} id */
export function markChatSeen(id) {
  for (const other of Object.keys(state.generating)) {
    if (other !== id) left[other] = true;
  }
  if (id) delete state.unread[id];
}

/** Forgets a chat, e.g. once it is deleted. */
export function clearChatActivity(id) {
  if (!id) return;
  delete state.generating[id];
  delete state.unread[id];
  delete left[id];
}

/**
 * @param {string} id
 * @returns {"generating"|"unread"|null}
 */
export function chatActivity(id) {
  if (state.generating[id]) return "generating";
  if (state.unread[id]) return "unread";
  return null;
}
