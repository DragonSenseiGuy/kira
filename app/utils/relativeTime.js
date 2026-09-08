/**
 * Compact "2h ago"-style timestamps.
 *
 * Shared so every surface that shows an age — the command palette's
 * conversation rows, the projects listing — words it identically. Callers that
 * want a placeholder for an unknown time supply their own (`|| "—"`); this
 * returns an empty string so it composes with `||`.
 */

/**
 * Format an epoch-ms stamp (or anything `new Date()` accepts) as a short age.
 *
 * @param {number|string|Date} value Timestamp, or a falsy/unparseable value.
 * @returns {string} e.g. "just now", "5m ago", "3h ago", "12d ago", or a
 *   locale date past 30 days. Empty string when the time is unknown.
 */
export function relativeTime(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}
