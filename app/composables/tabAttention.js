import { ref, readonly } from "vue";

// True from the moment a reply finishes in a tab the user is not looking at
// until they come back to it.
const unseen = ref(false);
let listening = false;

function onVisibilityChange() {
  if (!document.hidden) unseen.value = false;
}

/**
 * Call when a reply finishes. If the tab is in the background, flags it so
 * the tab title can show that something is waiting.
 */
export function noteReplyFinished() {
  if (typeof document === "undefined" || !document.hidden) return;
  if (!listening) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    listening = true;
  }
  unseen.value = true;
}

/** @returns {Readonly<import("vue").Ref<boolean>>} Whether a finished reply is waiting in this background tab. */
export function useUnseenReply() {
  return readonly(unseen);
}

/**
 * @param {boolean} hasUnseen
 * @returns {string} unhead title template: the page title, marked when a reply is waiting.
 */
export function tabTitleTemplate(hasUnseen) {
  return hasUnseen ? "● %s" : "%s";
}
