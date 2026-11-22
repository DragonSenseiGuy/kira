import { describe, it, expect } from "vitest";
import { messageTime } from "../app/utils/messageTime.js";

const now = new Date(2026, 10, 21, 20, 0);
const at = (...parts) => messageTime(new Date(...parts), now, "en-US");

describe("messageTime", () => {
  it("shows only the time for a message sent today", () => {
    expect(at(2026, 10, 21, 9, 5).label).toBe("9:05 AM");
  });

  it("adds the date for earlier days and the year for earlier years", () => {
    expect(at(2026, 10, 20, 23, 59).label).toBe("Nov 20, 11:59 PM");
    expect(at(2025, 10, 21, 9, 5).label).toBe("Nov 21, 2025, 9:05 AM");
  });

  it("does not treat the same day of another month as today", () => {
    expect(at(2026, 9, 21, 9, 5).label).toBe("Oct 21, 9:05 AM");
  });

  it("gives a full date for the tooltip and an ISO value for datetime", () => {
    const time = at(2026, 10, 21, 9, 5);
    expect(time.full).toBe("Saturday, November 21, 2026 at 9:05 AM");
    expect(time.iso).toBe(new Date(2026, 10, 21, 9, 5).toISOString());
  });

  it("accepts the ISO strings and numbers that storage and sync return", () => {
    const date = new Date(2026, 10, 21, 9, 5);
    expect(messageTime(date.toISOString(), now, "en-US").label).toBe("9:05 AM");
    expect(messageTime(date.getTime(), now, "en-US").label).toBe("9:05 AM");
  });

  it("returns null without a usable timestamp", () => {
    for (const value of [null, undefined, "", "not a date", new Date(NaN)]) {
      expect(messageTime(value, now)).toBeNull();
    }
  });
});
