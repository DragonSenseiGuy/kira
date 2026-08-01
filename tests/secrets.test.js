import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "../server/utils/secrets.js";

const SECRET = "test-encryption-secret-abc123";

describe("secret encryption", () => {
  it("round-trips a value", () => {
    const apiKey = "sk-test-0123456789abcdef";
    const encrypted = encryptSecret(apiKey, SECRET);
    expect(decryptSecret(encrypted, SECRET)).toBe(apiKey);
  });

  it("does not leak the plaintext into the stored value", () => {
    const encrypted = encryptSecret("sk-test-0123456789abcdef", SECRET);
    expect(encrypted).not.toContain("sk-test");
    expect(encrypted.startsWith("v1$")).toBe(true);
  });

  it("uses a fresh IV, so the same value encrypts differently each time", () => {
    const a = encryptSecret("same-key", SECRET);
    const b = encryptSecret("same-key", SECRET);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, SECRET)).toBe("same-key");
    expect(decryptSecret(b, SECRET)).toBe("same-key");
  });

  it("refuses to decrypt under a different secret", () => {
    const encrypted = encryptSecret("sk-test", SECRET);
    expect(decryptSecret(encrypted, "some-other-secret")).toBeNull();
  });

  it("detects tampering instead of returning garbage", () => {
    const encrypted = encryptSecret("sk-test-0123456789", SECRET);
    const [version, iv, tag, ciphertext] = encrypted.split("$");

    // Flip the last character of the ciphertext.
    const flipped = ciphertext.slice(0, -1) + (ciphertext.at(-1) === "A" ? "B" : "A");
    expect(decryptSecret([version, iv, tag, flipped].join("$"), SECRET)).toBeNull();

    // And of the auth tag.
    const badTag = tag.slice(0, -1) + (tag.at(-1) === "A" ? "B" : "A");
    expect(decryptSecret([version, iv, badTag, ciphertext].join("$"), SECRET)).toBeNull();
  });

  it("returns null for malformed input rather than throwing", () => {
    for (const value of ["", "nope", "v1$a$b", "v2$a$b$c", null, undefined, 42]) {
      expect(decryptSecret(value, SECRET)).toBeNull();
    }
  });

  it("handles long and unicode values", () => {
    for (const value of ["k".repeat(512), "clé-🔑-ключ"]) {
      expect(decryptSecret(encryptSecret(value, SECRET), SECRET)).toBe(value);
    }
  });
});
