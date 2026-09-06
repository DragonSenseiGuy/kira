/**
 * Tests for app/utils/relativeTime.js — the shared "2h ago" formatter.
 *
 * Extracted from a copy that had drifted between the command palette and
 * the projects listing, so the point of these is that one implementation
 * covers both callers' cases, including the unknown-time path each of them
 * words differently.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { relativeTime } from "../app/utils/relativeTime";

const NOW = new Date("2026-09-06T12:00:00Z").getTime();

function at(msAgo) {
  vi.setSystemTime(NOW);
  return NOW - msAgo;
}

afterEach(() => vi.useRealTimers());

describe("relativeTime", () => {
  it("returns an empty string for an unknown time, so callers can supply a placeholder", () => {
    expect(relativeTime(0)).toBe("");
    expect(relativeTime(null)).toBe("");
    expect(relativeTime(undefined)).toBe("");
    expect(relativeTime("not a date")).toBe("");
    expect(relativeTime(0) || "—").toBe("—");
  });

  it("reports sub-minute ages as just now", () => {
    vi.useFakeTimers();
    expect(relativeTime(at(10_000))).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    vi.useFakeTimers();
    expect(relativeTime(at(5 * 60_000))).toBe("5m ago");
    expect(relativeTime(at(3 * 3_600_000))).toBe("3h ago");
    expect(relativeTime(at(12 * 86_400_000))).toBe("12d ago");
  });

  it("falls back to a locale date past 30 days", () => {
    vi.useFakeTimers();
    const old = at(400 * 86_400_000);
    expect(relativeTime(old)).toBe(new Date(old).toLocaleDateString());
  });

  it("accepts anything Date accepts, not just epoch ms", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(relativeTime(new Date(NOW - 5 * 60_000))).toBe("5m ago");
    expect(relativeTime(new Date(NOW - 5 * 60_000).toISOString())).toBe("5m ago");
  });
});
