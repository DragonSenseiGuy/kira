import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "../server/utils/password.js";

describe("password hashing", () => {
  it("never stores the password itself", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("accepts the right password", async () => {
    const hash = await hashPassword("hunter2hunter2");
    await expect(verifyPassword("hunter2hunter2", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("hunter2hunter2");
    await expect(verifyPassword("hunter2hunter3", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("salts each hash, so identical passwords differ", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    await expect(verifyPassword("same-password", a)).resolves.toBe(true);
    await expect(verifyPassword("same-password", b)).resolves.toBe(true);
  });

  it("rejects malformed or missing hashes instead of throwing", async () => {
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$1$2$3$4")).resolves.toBe(false);
    await expect(verifyPassword("x", undefined)).resolves.toBe(false);
  });

  it("handles unicode and boundary-length passwords", async () => {
    const shortest = "a".repeat(MIN_PASSWORD_LENGTH);
    const longest = "b".repeat(MAX_PASSWORD_LENGTH);
    const unicode = "пароль-🔐-passwörd";

    for (const password of [shortest, longest, unicode]) {
      const hash = await hashPassword(password);
      await expect(verifyPassword(password, hash)).resolves.toBe(true);
    }
  });
});
