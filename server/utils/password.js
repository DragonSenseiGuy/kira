import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// OWASP-recommended scrypt parameters (N=2^15, r=8, p=1).
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export const MIN_PASSWORD_LENGTH = 8;
// scrypt is not length-limited like bcrypt, but an upper bound keeps a huge
// password from turning login into a denial-of-service vector.
export const MAX_PASSWORD_LENGTH = 256;

/**
 * Hashes a password with a random salt.
 * Format: scrypt$N$r$p$<salt-b64url>$<key-b64url>
 * @param {string} password
 * @returns {Promise<string>} The encoded hash, safe to store.
 */
export async function hashPassword(password) {
  const { N, r, p } = SCRYPT_PARAMS;
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);

  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * Verifies a password against an encoded hash in constant time.
 * @param {string} password
 * @param {string} encoded - A hash produced by hashPassword
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, encoded) {
  if (typeof encoded !== "string") return false;

  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, N, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(keyB64, "base64url");

  try {
    const actual = await scryptAsync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
