import { query } from "../db/index.js";
import { decryptSecret, encryptSecret, getEncryptionSecret } from "./secrets";
import { accountsEnabled, getAccountSession } from "./account";

/**
 * Storage for each user's own API key, encrypted at rest.
 */

/**
 * Returns the signed-in user's decrypted API key, or null if they have none.
 * A value that fails to decrypt (secret rotated, row tampered with) is
 * treated as "no key" rather than an error.
 * @param {import('h3').H3Event} event
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getUserApiKey(event, userId) {
  const result = await query(
    `SELECT api_key_encrypted FROM users WHERE id = $1`,
    [userId]
  );

  const encrypted = result.rows[0]?.api_key_encrypted;
  if (!encrypted) return null;

  const apiKey = decryptSecret(encrypted, getEncryptionSecret(event));
  if (!apiKey) {
    console.warn(`[API] Could not decrypt the stored API key for user ${userId}`);
    return null;
  }

  return apiKey;
}

/**
 * Stores (or clears, when apiKey is null) a user's API key.
 * @param {import('h3').H3Event} event
 * @param {string} userId
 * @param {string|null} apiKey
 */
export async function setUserApiKey(event, userId, apiKey) {
  const encrypted = apiKey
    ? encryptSecret(apiKey, getEncryptionSecret(event))
    : null;

  await query(`UPDATE users SET api_key_encrypted = $1 WHERE id = $2`, [
    encrypted,
    userId,
  ]);
}

/**
 * Resolves the API key to use for a request. Everyone brings their own key:
 * the one the client just sent wins (it's the freshest thing the user typed),
 * otherwise we fall back to the key saved on their account, which is what
 * makes a brand new device work.
 * @param {import('h3').H3Event} event
 * @param {string|undefined} customApiKey - Key sent with the request, if any
 * @returns {Promise<string|null>}
 */
export async function resolveApiKey(event, customApiKey) {
  if (customApiKey) return customApiKey;
  if (!accountsEnabled()) return null;

  const session = getAccountSession(event);
  if (!session) return null;

  try {
    return await getUserApiKey(event, session.uid);
  } catch (error) {
    console.error("[API] Could not read the stored API key:", error.message);
    return null;
  }
}

/**
 * A non-secret hint for the UI, e.g. `sk-a…6f2b`. Never shows enough of the
 * key to be usable.
 * @param {string} apiKey
 * @returns {string}
 */
export function maskApiKey(apiKey) {
  if (typeof apiKey !== "string" || apiKey.length < 8) return "••••";
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
