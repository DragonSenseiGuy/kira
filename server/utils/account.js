import { createError, getCookie, setCookie, deleteCookie } from "h3";
import { signSessionToken, verifySessionToken } from "./session";
import { isDatabaseConfigured } from "../db/index.js";

export const ACCOUNT_COOKIE = "kira_account";
export const ACCOUNT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Accounts only exist when there is a database to keep them in. Without one
 * Kira stays local-only and every route is open, matching its old behaviour.
 * @returns {boolean}
 */
export function accountsEnabled() {
  return isDatabaseConfigured();
}

function getSessionSecret(event) {
  const secret = useRuntimeConfig(event).sessionSecret;
  if (!secret) {
    throw createError({
      statusCode: 500,
      statusMessage: "Server misconfigured: missing NUXT_SESSION_SECRET",
    });
  }
  return secret;
}

/**
 * Issues a signed, httpOnly account cookie for a user.
 * @param {import('h3').H3Event} event
 * @param {{id: string, email: string}} user
 */
export function issueAccountSession(event, user) {
  const expiresAt = Date.now() + ACCOUNT_TTL_MS;
  const token = signSessionToken(
    { uid: user.id, email: user.email, exp: expiresAt },
    getSessionSecret(event)
  );

  setCookie(event, ACCOUNT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !import.meta.dev,
    path: "/",
    maxAge: Math.floor(ACCOUNT_TTL_MS / 1000),
  });

  return { expiresAt };
}

/**
 * Clears the account cookie.
 * @param {import('h3').H3Event} event
 */
export function clearAccountSession(event) {
  deleteCookie(event, ACCOUNT_COOKIE, { path: "/" });
}

/**
 * Reads the signed account cookie.
 * @param {import('h3').H3Event} event
 * @returns {{uid: string, email: string, exp: number}|null}
 */
export function getAccountSession(event) {
  const token = getCookie(event, ACCOUNT_COOKIE);
  if (!token) return null;

  const payload = verifySessionToken(token, getSessionSecret(event));
  if (!payload || !payload.uid) return null;

  return payload;
}

/**
 * Returns the signed-in user's id, or throws a 401.
 * Use this instead of trusting any client-supplied user id.
 * @param {import('h3').H3Event} event
 * @returns {string}
 */
export function requireUserId(event) {
  const session = getAccountSession(event);
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: "Sign in to access your chats",
    });
  }
  return session.uid;
}

/**
 * Guards a route that needs the database to be configured.
 * @param {import('h3').H3Event} event
 */
export function requireDatabase(event) {
  if (!accountsEnabled()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Accounts are disabled: no DATABASE_URL configured",
    });
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trims and lowercases an email, returning null when it is not usable.
 * @param {unknown} email
 * @returns {string|null}
 */
export function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}
