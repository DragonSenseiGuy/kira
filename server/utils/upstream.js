/**
 * Validates a user-supplied upstream base URL for the server-side relay.
 *
 * Because Libre Assistant relays OpenAI-compatible traffic, a malicious
 * client could otherwise turn the deployment into an SSRF probe. Rules:
 *   - Must be a valid http(s) URL.
 *   - HTTPS is required for anything that is not loopback/private.
 *   - Loopback / private / link-local targets are REJECTED unless the
 *     operator opts in with NUXT_ALLOW_LOCAL_UPSTREAMS=true (needed for
 *     self-hosted setups talking to Ollama/LM Studio on the same host).
 *
 * @param {string} rawUrl
 * @param {Object} [env]  Override for process.env (tests).
 * @returns {string|null} The normalized URL string, or null when invalid.
 */
export function validateUpstreamBaseUrl(rawUrl, env = process.env) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname) return null;

  const hostname = url.hostname.toLowerCase();
  // Bracketed IPv6 hosts ("[::1]") — strip brackets for comparisons.
  const bareHost = hostname.replace(/^\[|\]$/g, "");

  const isLoopback =
    bareHost === "localhost" ||
    bareHost === "127.0.0.1" ||
    bareHost === "::1" ||
    bareHost.endsWith(".localhost");

  const isPrivateV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(bareHost);
  const isLinkLocalV4 = /^169\.254\./.test(bareHost);
  const isUniqueLocalV6 = /^f[cd]/.test(bareHost); // fc00::/7

  const isLocalTarget = isLoopback || isPrivateV4 || isLinkLocalV4 || isUniqueLocalV6;

  if (isLocalTarget) {
    const allowLocal = String(env.NUXT_ALLOW_LOCAL_UPSTREAMS || "").toLowerCase() === "true";
    if (!allowLocal) return null;
  }

  // Non-local targets must use https so keys are never sent in cleartext.
  if (!isLocalTarget && url.protocol !== "https:") return null;

  // Strip any credentials embedded in the URL.
  url.username = "";
  url.password = "";
  // Normalize: no trailing slash needed; keep path (some gateways mount under /v1 etc.)
  return url.toString().replace(/\/+$/, "") || null;
}

/**
 * Appends a path to a validated base URL safely.
 * @param {string} baseUrl Validated base URL.
 * @param {string} path    Path beginning with "/".
 * @returns {string}
 */
export function joinUpstreamPath(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
