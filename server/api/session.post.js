import { createError, defineEventHandler } from "h3";
import { signSessionToken } from "../utils/session";
import { accountsEnabled, getAccountSession } from "../utils/account";

// Client refreshes 60s before expiry (REFRESH_BUFFER_MS in composables/useSession.js)
const SESSION_TTL_MS = 8 * 60 * 1000; // 8 minutes

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const sessionSecret = config.sessionSecret;

  if (!sessionSecret) {
    event.node.res.statusCode = 500;
    return { error: "Server misconfigured: missing session secret" };
  }

  // With accounts enabled, only signed-in users get an AI session. Without a
  // database configured Kira stays open to everyone, as it was before.
  const account = accountsEnabled() ? getAccountSession(event) : null;
  if (accountsEnabled() && !account) {
    throw createError({ statusCode: 401, statusMessage: "Sign in to use Kira" });
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sessionToken = signSessionToken(
    account ? { uid: account.uid, exp: expiresAt } : { exp: expiresAt },
    sessionSecret
  );

  return { sessionToken, expiresAt };
});
