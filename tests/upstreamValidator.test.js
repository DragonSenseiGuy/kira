/**
 * Tests for server/utils/upstream.js — SSRF guard for user-supplied
 * OpenAI-compatible endpoint URLs.
 *
 * Contract:
 *   - Public https endpoints are allowed (normalized).
 *   - Plaintext http is only allowed for loopback/private targets, and
 *     those are only allowed at all when NUXT_ALLOW_LOCAL_UPSTREAMS=true.
 *   - Embedded credentials and trailing slashes are stripped.
 */

import { describe, it, expect } from "vitest";
import {
  validateUpstreamBaseUrl,
  joinUpstreamPath,
} from "../server/utils/upstream.js";

const NO_LOCAL = { NUXT_ALLOW_LOCAL_UPSTREAMS: "" };
const ALLOW_LOCAL = { NUXT_ALLOW_LOCAL_UPSTREAMS: "true" };

describe("validateUpstreamBaseUrl", () => {
  it("accepts public https URLs and normalizes them", () => {
    expect(validateUpstreamBaseUrl("https://api.example.com/v1/", NO_LOCAL)).toBe(
      "https://api.example.com/v1",
    );
    expect(validateUpstreamBaseUrl("https://openrouter.ai/api/v1", NO_LOCAL)).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("strips embedded credentials", () => {
    const result = validateUpstreamBaseUrl(
      "https://user:pass@api.example.com/v1",
      NO_LOCAL,
    );
    expect(result).toBe("https://api.example.com/v1");
  });

  it("rejects non-URL junk and unsupported protocols", () => {
    expect(validateUpstreamBaseUrl("not a url", NO_LOCAL)).toBeNull();
    expect(validateUpstreamBaseUrl("", NO_LOCAL)).toBeNull();
    expect(validateUpstreamBaseUrl(null, NO_LOCAL)).toBeNull();
    expect(validateUpstreamBaseUrl(undefined, NO_LOCAL)).toBeNull();
    expect(validateUpstreamBaseUrl("ftp://api.example.com", NO_LOCAL)).toBeNull();
    expect(validateUpstreamBaseUrl("file:///etc/passwd", NO_LOCAL)).toBeNull();
  });

  it("rejects plaintext http for public hosts (key would be sent in cleartext)", () => {
    expect(validateUpstreamBaseUrl("http://api.example.com/v1", NO_LOCAL)).toBeNull();
    expect(validateUpstreamBaseUrl("http://api.example.com/v1", ALLOW_LOCAL)).toBeNull();
  });

  it("rejects loopback and private targets by default", () => {
    const localUrls = [
      "http://localhost:11434/v1",
      "https://localhost:1234/v1",
      "http://127.0.0.1:8080/v1",
      "https://10.0.0.5/v1",
      "https://192.168.1.10/v1",
      "https://172.16.0.1/v1",
      "https://172.31.255.255/v1",
      "https://169.254.169.254/latest", // cloud metadata endpoint
      "https://[fd00::1]/v1", // unique-local IPv6
    ];
    for (const url of localUrls) {
      expect(validateUpstreamBaseUrl(url, NO_LOCAL)).toBeNull();
    }
  });

  it("allows loopback/private targets when the operator opts in", () => {
    expect(validateUpstreamBaseUrl("http://localhost:11434/v1", ALLOW_LOCAL)).toBe(
      "http://localhost:11434/v1",
    );
    expect(validateUpstreamBaseUrl("https://127.0.0.1:8080/v1", ALLOW_LOCAL)).toBe(
      "https://127.0.0.1:8080/v1",
    );
    expect(validateUpstreamBaseUrl("https://192.168.1.10/v1", ALLOW_LOCAL)).toBe(
      "https://192.168.1.10/v1",
    );
  });

  it("rejects private-range boundaries outside 172.16-31", () => {
    // 172.32.x.x is PUBLIC — should be fine over https even without opt-in.
    expect(validateUpstreamBaseUrl("https://172.32.0.1/v1", NO_LOCAL)).toBe(
      "https://172.32.0.1/v1",
    );
  });
});

describe("joinUpstreamPath", () => {
  it("joins without double slashes", () => {
    expect(joinUpstreamPath("https://a.com/v1", "/models")).toBe("https://a.com/v1/models");
    expect(joinUpstreamPath("https://a.com/v1/", "models")).toBe("https://a.com/v1/models");
  });
});
