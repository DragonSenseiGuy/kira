/**
 * Where an arrow key moves focus within the sidebar: the search field sits
 * above the chats, so Down from it enters the list and Up from the first chat
 * returns to it.
 *
 * @param {string} key KeyboardEvent.key.
 * @param {Element} current The focused element: the search field or a chat link.
 * @param {Element} search The search field.
 * @param {Element[]} chats Chat links, top to bottom.
 * @returns {Element|null} The element to focus, or null to leave the key alone.
 */
export function sidebarArrowTarget(key, current, search, chats) {
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;
  const down = key === "ArrowDown";
  if (current === search) return down ? chats[0] ?? null : null;
  const index = chats.indexOf(current);
  if (index === -1) return null;
  if (down) return chats[index + 1] ?? null;
  return index === 0 ? search : chats[index - 1];
}
