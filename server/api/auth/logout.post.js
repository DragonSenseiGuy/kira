import { defineEventHandler } from "h3";
import { clearAccountSession } from "../../utils/account";

/**
 * POST /api/auth/logout
 * Clears the account cookie.
 */
export default defineEventHandler((event) => {
  clearAccountSession(event);
  return { success: true };
});
