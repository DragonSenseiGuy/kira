import { createError, defineEventHandler, readBody } from "h3";
import { query } from "../../db/index.js";
import {
  issueAccountSession,
  normalizeEmail,
  requireDatabase,
} from "../../utils/account";
import { verifyPassword } from "../../utils/password";

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);

  const body = await readBody(event);
  const email = normalizeEmail(body?.email);
  const password = body?.password;

  // Same message for every failure mode so the endpoint can't be used to
  // enumerate which emails have accounts.
  const invalid = () =>
    createError({ statusCode: 401, statusMessage: "Invalid email or password" });

  if (!email || typeof password !== "string" || !password) {
    throw invalid();
  }

  let result;
  try {
    result = await query(
      `SELECT id, email, password_hash FROM users WHERE LOWER(email) = $1`,
      [email]
    );
  } catch (error) {
    console.error("[API] Error looking up user:", error);
    throw createError({ statusCode: 500, statusMessage: "Could not sign in" });
  }

  if (result.rows.length === 0) throw invalid();

  const user = result.rows[0];
  if (!(await verifyPassword(password, user.password_hash))) throw invalid();

  const { expiresAt } = issueAccountSession(event, user);

  return { user: { id: user.id, email: user.email }, expiresAt };
});
