import { defineEventHandler } from "h3";
import { accountsEnabled, getAccountSession } from "../../utils/account";

/**
 * GET /api/auth/me
 * Reports whether accounts are enabled and who (if anyone) is signed in.
 * The client uses this to decide between the login screen and the app.
 */
export default defineEventHandler((event) => {
  if (!accountsEnabled()) {
    return { accountsEnabled: false, user: null };
  }

  const session = getAccountSession(event);

  return {
    accountsEnabled: true,
    user: session ? { id: session.uid, email: session.email } : null,
  };
});
