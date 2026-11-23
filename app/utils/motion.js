/**
 * The scroll behaviour to use for a scripted scroll: the requested one, or an
 * instant jump when the system asks for reduced motion. The stylesheet's
 * `scroll-behavior: auto` does not cover this, because a behaviour passed to
 * `scrollTo` / `scrollIntoView` takes precedence over it.
 *
 * @param {ScrollBehavior} behavior
 * @param {typeof globalThis.matchMedia} [matchMedia]
 * @returns {ScrollBehavior}
 */
export function motionSafeScroll(behavior, matchMedia = globalThis.matchMedia) {
  if (behavior !== "smooth") return behavior;
  try {
    return matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "smooth";
  }
}
