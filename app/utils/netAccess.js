/**
 * @file netAccess.js
 * @description Pure decision logic for sandbox network egress.
 *
 * The sandbox itself has no network. Generated code calls net.fetch(), which
 * routes through the main thread and — when permitted — through our
 * session-guarded /api/net relay that applies SSRF rules and size caps.
 * This module decides WHETHER a request is allowed, before any I/O.
 */

/**
 * Modes:
 *  - 'off'  : no sandbox networking at all
 *  - 'ask'  : per-domain; domains with an 'always' grant pass silently,
 *             everything else triggers a user prompt (handled by caller)
 *  - 'auto' : everything is allowed without prompting (grants still recorded)
 */

/** Extracts the hostname from a URL, or null when invalid. */
export function extractDomain(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** True when the stored grant means "no more asking". */
export function hasAlwaysGrant(grants, domain) {
  return !!grants?.[domain]?.mode === true || grants?.[domain]?.mode === "always";
}

/**
 * Decides how to handle a sandbox request to `domain`.
 *
 * @param {string} mode - Settings mode: 'off' | 'ask' | 'auto'.
 * @param {Object} grants - Map of domain -> { mode: 'always' }.
 * @param {string} domain - Lowercased hostname.
 * @returns {{decision:'allow'|'ask'|'deny', reason?:string}}
 */
export function decideNetAccess(mode, grants, domain) {
  if (!domain) {
    return { decision: "deny", reason: "Invalid URL." };
  }
  if (mode === "off") {
    return {
      decision: "deny",
      reason: "Sandbox networking is turned off in Settings → Autonomy.",
    };
  }
  if (hasAlwaysGrant(grants, domain)) {
    return { decision: "allow" };
  }
  if (mode === "auto") {
    return { decision: "allow" };
  }
  return { decision: "ask" };
}

/** Records/updates an activity entry shape (pure). */
export function makeActivityEntry({ url, domain, method, status, bytes, outcome }) {
  return {
    at: new Date().toISOString(),
    url: String(url ?? "").slice(0, 300),
    domain: domain || null,
    method: String(method || "GET").toUpperCase(),
    status: status ?? null,
    bytes: bytes ?? null,
    outcome: outcome || "ok", // ok | denied | error | timeout
  };
}
