/**
 * Shared motion presets.
 *
 * These mirror the timing conventions used by interior.dev so every animated
 * surface in Kira settles the same way: FILL for things that grow into place
 * (bars, panels, height changes), POP for things that appear at full size
 * (chips, badges, toggles), ENTER for content arriving after a request.
 *
 * Pass them straight to motion-v's `:transition`. `STILL` is the
 * reduced-motion substitute — same end state, no travel.
 */

export const EASE = [0.23, 1, 0.32, 1];

export const FILL = { type: "spring", stiffness: 210, damping: 34, mass: 0.9 };
export const POP = { type: "spring", stiffness: 640, damping: 22, mass: 0.7 };
export const ENTER = { duration: 0.2, ease: EASE };
export const STILL = { duration: 0 };

/** Fade + 4px rise. The default entrance for streamed or async content. */
export const enterUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -2 },
};

/** Scale-from-97% pop, used by popovers, menus and toasts. */
export const enterPop = {
  initial: { opacity: 0, scale: 0.97, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98 },
};

/**
 * Resolve a transition against the user's motion preference.
 * @param {object} transition - The preset to use when motion is allowed.
 * @returns {object} `transition`, or `STILL` when reduced motion is set.
 */
export function respectMotion(transition) {
  if (typeof window === "undefined") return transition;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduced ? STILL : transition;
}
