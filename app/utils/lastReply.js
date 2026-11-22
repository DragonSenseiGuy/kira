/**
 * @file lastReply.js
 * @description Finds the reply the "Copy last response" shortcut copies.
 */

/**
 * @param {Array<object>} messages Messages on screen, oldest first.
 * @param {(message: object) => string} textOf Returns a message's copyable text.
 * @returns {object|null} The newest assistant message with text, if any.
 */
export function lastCopyableReply(messages, textOf) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant" && textOf(message).trim()) return message;
  }
  return null;
}
