import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Symmetric encryption for secrets that have to be readable again — API keys,
 * unlike passwords, must be recoverable to be used, so they're encrypted
 * rather than hashed.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const VERSION = "v1";
// Fixed, app-specific salt: the derived key has to be stable across restarts,
// and the secret it's derived from is already high-entropy.
const KEY_SALT = "kira-secret-encryption-v1";

let cachedKey = null;
let cachedSecret = null;

function deriveKey(secret) {
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = scryptSync(secret, KEY_SALT, 32);
  cachedSecret = secret;
  return cachedKey;
}

/**
 * The secret backing encryption. A dedicated NUXT_ENCRYPTION_KEY is preferred;
 * NUXT_SESSION_SECRET is the fallback so existing deployments keep working.
 * @returns {string}
 */
export function getEncryptionSecret(event) {
  const config = useRuntimeConfig(event);
  const secret = config.encryptionKey || config.sessionSecret;

  if (!secret) {
    throw new Error(
      "Missing NUXT_ENCRYPTION_KEY (or NUXT_SESSION_SECRET) — cannot encrypt stored secrets"
    );
  }

  return secret;
}

/**
 * Encrypts a string with AES-256-GCM.
 * Format: v1$<iv>$<auth-tag>$<ciphertext>, all base64url.
 * @param {string} plaintext
 * @param {string} secret
 * @returns {string}
 */
export function encryptSecret(plaintext, secret) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join("$");
}

/**
 * Decrypts a value produced by encryptSecret.
 * Returns null for anything malformed, tampered with, or encrypted under a
 * different secret — callers treat that as "no value stored" rather than
 * failing the request.
 * @param {string} encoded
 * @param {string} secret
 * @returns {string|null}
 */
export function decryptSecret(encoded, secret) {
  if (typeof encoded !== "string") return null;

  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  const [, ivB64, tagB64, ciphertextB64] = parts;

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      deriveKey(secret),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
