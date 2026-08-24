/**
 * Tests for previewKindFor (exported from useWorkspaceBrowser).
 *
 * The Preview⇄Code toggle and every renderer branch key off this
 * classification, so the mapping is load-bearing:
 *   md/markdown → "md", html/htm/svg → "html", json → "json", else "text"
 */

import { describe, it, expect } from "vitest";
import { previewKindFor } from "../app/composables/useWorkspaceBrowser";

describe("previewKindFor", () => {
  it("classifies markdown as md", () => {
    expect(previewKindFor("notes.md")).toBe("md");
    expect(previewKindFor("deep/nested/report.markdown")).toBe("md");
  });

  it("classifies html/htm/svg as html (sandboxed document renderer)", () => {
    expect(previewKindFor("page.html")).toBe("html");
    expect(previewKindFor("page.htm")).toBe("html");
    expect(previewKindFor("art.svg")).toBe("html");
  });

  it("classifies json", () => {
    expect(previewKindFor("data.json")).toBe("json");
  });

  it("falls back to text for everything else", () => {
    expect(previewKindFor("script.js")).toBe("text");
    expect(previewKindFor("table.csv")).toBe("text");
    expect(previewKindFor("README")).toBe("text");
    expect(previewKindFor("archive.tar.gz")).toBe("text");
  });

  it("is case-insensitive on extensions", () => {
    expect(previewKindFor("Notes.MD")).toBe("md");
    expect(previewKindFor("Page.HTML")).toBe("html");
    expect(previewKindFor("Data.JSON")).toBe("json");
  });
});
