// Replies that are still being generated or saved. Module-level because a
// reply outlives the page that started it.
let holds = 0;

function onBeforeUnload(event) {
  // Browsers show their own "Leave site?" prompt; the text is not ours to set.
  event.preventDefault();
  event.returnValue = "";
}

/**
 * Asks the browser to confirm before the tab is closed or reloaded, until the
 * returned function is called. Closing mid-reply would lose the reply.
 *
 * @returns {() => void} Releases this hold; safe to call more than once.
 */
export function holdLeaveGuard() {
  if (typeof window === "undefined") return () => {};
  if (holds === 0) window.addEventListener("beforeunload", onBeforeUnload);
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
