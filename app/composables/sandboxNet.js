/**
 * @file sandboxNet.js
 * @description Client-side enforcement for sandbox network egress.
 *
 * Flow for one net.fetch() from generated code:
 *   worker RPC → decideNetAccess(mode, grants, domain)
 *     deny   → throw (structured refusal reaches the model)
 *     ask    → emitter event 'net-consent-request' → UI modal (fallback:
 *              window.confirm when no host is mounted) → grant recorded
 *     allow  → POST /api/net (session-guarded relay w/ SSRF rules & caps)
 *   Every attempt is appended to settings.net_activity (capped).
 */

import { useSettings } from "./useSettings";
import { getSessionToken } from "./useSession";
import { emitter } from "./emitter";
import {
  extractDomain,
  decideNetAccess,
  makeActivityEntry,
} from "~/utils/netAccess";

const MAX_ACTIVITY = 50;

function recordActivity(entry) {
  const settings = useSettings().settings;
  if (!Array.isArray(settings.net_activity)) settings.net_activity = [];
  settings.net_activity.push(entry);
  if (settings.net_activity.length > MAX_ACTIVITY) {
    settings.net_activity.splice(0, settings.net_activity.length - MAX_ACTIVITY);
  }
  try {
    useSettings().saveSettings();
  } catch {}
}

function rememberGrant(domain) {
  const settings = useSettings().settings;
  if (!settings.net_grants || typeof settings.net_grants !== "object") {
    settings.net_grants = {};
  }
  settings.net_grants[domain] = { mode: "always" };
  useSettings().saveSettings();
}

/**
 * Asks the user about a domain.
 *
 * The answer carries both halves of the decision — whether to allow it, and
 * whether to remember the domain — because they are one answer. An earlier
 * version resolved the boolean and passed `remember` through a global that
 * the caller read a microtask later; the ordering was impossible to see from
 * either side and "always allow" quietly degraded to "allow once".
 *
 * Prefers the mounted consent modal; falls back to window.confirm().
 *
 * @returns {Promise<{allowed: boolean, remember: boolean}>}
 */
function askConsent(url, domain) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (allowed, remember) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackId);
      window.removeEventListener("libre-net-consent", onWindowAnswer);
      resolve({ allowed: !!allowed, remember: !!remember });
    };

    // Fallback path: native dialog after a short grace period, or an
    // explicit answer event from the consent modal. Neither can express
    // "remember", so both answer for this request only.
    const fallbackId = setTimeout(() => {
      finish(window.confirm(`Allow the code sandbox to reach "${domain}"?\n\n${url}`), false);
    }, 350);

    const onWindowAnswer = (e) => finish(e.detail?.allowed, e.detail?.remember);
    window.addEventListener("libre-net-consent", onWindowAnswer);

    emitter.emit("net-consent-request", { url, domain, answer: finish });
  });
}

/**
 * Executes one permissioned sandbox request.
 * @param {string} url
 * @param {{method?:string, headers?:Object, body?:string}} [opts]
 */
export async function sandboxNetFetch(url, opts = {}) {
  const settings = useSettings().settings;
  const domain = extractDomain(url);
  const mode = settings.net_mode || "ask";

  let decision = decideNetAccess(mode, settings.net_grants, domain);
  if (decision.decision === "ask") {
    const { allowed, remember } = await askConsent(url, domain);
    decision = allowed ? { decision: "allow" } : { decision: "deny", reason: "Denied by user." };
    if (allowed && remember) rememberGrant(domain);
  }

  if (decision.decision === "deny") {
    recordActivity(makeActivityEntry({ url, domain, method: opts.method, outcome: "denied" }));
    throw new Error(decision.reason || "Request not permitted.");
  }

  try {
    const response = await fetch("/api/net", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": await getSessionToken(),
      },
      body: JSON.stringify({ url, method: opts.method || "GET", body: opts.body }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const message = data?.error || `Relay failed (HTTP ${response.status})`;
      recordActivity(
        makeActivityEntry({ url, domain, method: opts.method, status: response.status, outcome: "error" }),
      );
      throw new Error(message);
    }

    recordActivity(
      makeActivityEntry({
        url,
        domain,
        method: opts.method,
        status: data.status,
        bytes: data.bytes,
        outcome: "ok",
      }),
    );
    return data; // {status, contentType, body, bytes, truncated}
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("Relay failed"))) {
      // Already recorded above for relay errors; record transport errors here.
      recordActivity(
        makeActivityEntry({ url, domain, method: opts.method, outcome: "error" }),
      );
    }
    throw error;
  }
}
