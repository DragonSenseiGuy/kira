import { defineEventHandler } from "h3";
import { signSessionToken } from "../utils/session";

// Client refreshes 60s before expiry (REFRESH_BUFFER_MS in composables/useSession.js)
const SESSION_TTL_MS = 8 * 60 * 1000; // 8 minutes

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const sessionSecret = config.sessionSecret;

  if (!sessionSecret) {
    event.node.res.statusCode = 500;
    return { error: "Server misconfigured: missing session secret" };
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sessionToken = signSessionToken({ exp: expiresAt }, sessionSecret);

  return { sessionToken, expiresAt };
});
