import { describe, it, expect } from "vitest";
import { matchParts } from "~/utils/matchParts";

const joined = (parts) => parts.map((p) => p.text).join("");
const hits = (parts) => parts.filter((p) => p.match).map((p) => p.text);

describe("matchParts", () => {
  it("returns the whole text unmarked without a query", () => {
    expect(matchParts("Trip plan", "")).toEqual([{ text: "Trip plan", match: false }]);
    expect(matchParts("Trip plan", "   ")).toEqual([{ text: "Trip plan", match: false }]);
  });

  it("marks a match and keeps the title's own capitals", () => {
    expect(matchParts("Trip Plan for May", "plan")).toEqual([
      { text: "Trip ", match: false },
      { text: "Plan", match: true },
      { text: " for May", match: false },
    ]);
  });

  it("marks every occurrence, at either end too", () => {
    const parts = matchParts("data about data", "data");
    expect(hits(parts)).toEqual(["data", "data"]);
    expect(joined(parts)).toBe("data about data");
  });

  it("ignores spaces around the query, as the search does", () => {
    expect(hits(matchParts("Trip plan", "  trip "))).toEqual(["Trip"]);
  });

  it("leaves the text whole when nothing matches", () => {
    expect(matchParts("Trip plan", "zzz")).toEqual([{ text: "Trip plan", match: false }]);
  });

  it("copes with a missing title", () => {
    expect(matchParts(undefined, "a")).toEqual([{ text: "", match: false }]);
  });

  it("does not mark the wrong letters when lower-casing changes length", () => {
    const parts = matchParts("İstanbul trip", "trip");
    expect(joined(parts)).toBe("İstanbul trip");
    expect(hits(parts).every((hit) => hit.toLowerCase() === "trip")).toBe(true);
  });
});
