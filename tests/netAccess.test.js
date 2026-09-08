/**
 * Tests for app/utils/netAccess.js — pure sandbox-network decision logic.
 */

import { describe, it, expect } from "vitest";
import {
  extractDomain,
  hasAlwaysGrant,
  decideNetAccess,
  makeActivityEntry,
} from "../app/utils/netAccess.js";

describe("extractDomain", () => {
  it("lowercases hostnames and rejects junk", () => {
    expect(extractDomain("https://API.GitHub.com/repos")).toBe("api.github.com");
    expect(extractDomain("https://example.com:8443/x")).toBe("example.com");
    expect(extractDomain("not a url")).toBeNull();
    expect(extractDomain("")).toBeNull();
  });
});

describe("hasAlwaysGrant", () => {
  it("recognizes stored always-grants", () => {
    expect(hasAlwaysGrant({ "a.com": { mode: "always" } }, "a.com")).toBe(true);
    expect(hasAlwaysGrant({}, "a.com")).toBe(false);
    expect(hasAlwaysGrant(undefined, "a.com")).toBe(false);
    expect(hasAlwaysGrant({ "a.com": {} }, "a.com")).toBe(false);
  });
});

describe("decideNetAccess", () => {
  it("denies everything when mode is off — even granted domains", () => {
    const r = decideNetAccess("off", { "x.com": { mode: "always" } }, "x.com");
    expect(r.decision).toBe("deny");
    expect(r.reason).toMatch(/turned off/i);
  });

  it("allows granted domains silently in ask mode", () => {
    expect(decideNetAccess("ask", { "x.com": { mode: "always" } }, "x.com").decision).toBe("allow");
  });

  it("asks for unknown domains in ask mode (the default)", () => {
    expect(decideNetAccess("ask", {}, "new.org").decision).toBe("ask");
    expect(decideNetAccess(undefined, {}, "new.org").decision).toBe("ask");
  });

  it("allows everything in auto mode but still denies invalid domains", () => {
    expect(decideNetAccess("auto", {}, "anything.dev").decision).toBe("allow");
    expect(decideNetAccess("auto", {}, "").decision).toBe("deny");
  });
});

describe("makeActivityEntry", () => {
  it("shapes a capped audit record", () => {
    const e = makeActivityEntry({
      url: "https://api.github.com/" + "x".repeat(400),
      domain: "api.github.com",
      method: "post",
      status: 200,
      bytes: 1234,
      outcome: "ok",
    });
    expect(e.url.length).toBeLessThanOrEqual(300);
    expect(e.method).toBe("POST");
    expect(e.outcome).toBe("ok");
    expect(new Date(e.at).toString()).not.toBe("Invalid Date");
  });
});
