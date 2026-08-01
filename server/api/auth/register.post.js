import { createError, defineEventHandler, readBody } from "h3";
import { query } from "../../db/index.js";
import {
  issueAccountSession,
  normalizeEmail,
  requireDatabase,
} from "../../utils/account";
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "../../utils/password";

/**
 * POST /api/auth/register
 * Creates an account and signs the user in.
 * Body: { email, password }
 */
export default defineEventHandler(async (event) => {
  requireDatabase(event);

  const body = await readBody(event);
  const email = normalizeEmail(body?.email);
  const password = body?.password;

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: "Enter a valid email address",
    });
  }

  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    });
  }

  const passwordHash = await hashPassword(password);

  let result;
  try {
    result = await query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, passwordHash]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw createError({
        statusCode: 409,
        statusMessage: "An account with that email already exists",
      });
    }
    console.error("[API] Error registering user:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "Could not create the account",
    });
  }

  const user = result.rows[0];
  const { expiresAt } = issueAccountSession(event, user);

  return {
    user: { id: user.id, email: user.email, createdAt: user.created_at },
    expiresAt,
  };
});
