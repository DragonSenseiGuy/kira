/**
 * @file scrollPosition.js
 * @description Decides how far a scroll container is from its end.
 */

/** Within this many pixels the view counts as following the conversation. */
export const AT_BOTTOM_THRESHOLD = 10;

/** Further than this from the end, a "jump to latest" button is offered. */
export const JUMP_BUTTON_THRESHOLD = 240;

/**
 * @param {{scrollHeight: number, scrollTop: number, clientHeight: number}|null} container
 * @returns {number} Pixels between the visible area and the end of the content.
 */
export function distanceFromBottom(container) {
  if (!container) return 0;
  return Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
}

export function isAtBottom(container) {
  return distanceFromBottom(container) < AT_BOTTOM_THRESHOLD;
}

export function shouldOfferJump(container) {
  return distanceFromBottom(container) > JUMP_BUTTON_THRESHOLD;
}
