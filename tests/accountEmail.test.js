import { describe, it, expect } from "vitest";
import { normalizeEmail } from "../server/utils/account.js";

describe("normalizeEmail", () => {
  it("trims and lowercases so sign-in is case-insensitive", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });

  it("rejects values that aren't usable email addresses", () => {
    for (const value of ["", "   ", "person", "person@", "@example.com", "a b@c.com"]) {
      expect(normalizeEmail(value)).toBeNull();
    }
  });

  it("rejects non-strings", () => {
    for (const value of [null, undefined, 42, {}, ["a@b.com"]]) {
      expect(normalizeEmail(value)).toBeNull();
    }
  });

  it("rejects absurdly long addresses", () => {
    expect(normalizeEmail(`${"a".repeat(320)}@example.com`)).toBeNull();
  });
});
