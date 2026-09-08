/**
 * Tests for app/utils/htmlPreview.js — multi-file HTML preview inlining.
 */

import { describe, it, expect } from "vitest";
import {
  resolveRelativePath,
  inlineHtmlAssets,
  ensureBaseTag,
} from "../app/utils/htmlPreview.js";

describe("resolveRelativePath", () => {
  it("joins refs against the entry's directory", () => {
    expect(resolveRelativePath("projects/site/index.html", "style.css")).toBe(
      "projects/site/style.css",
    );
    expect(resolveRelativePath("index.html", "js/game.js")).toBe("js/game.js");
  });

  it("normalizes ./ and ../", () => {
    expect(resolveRelativePath("a/b/index.html", "./x.js")).toBe("a/b/x.js");
    expect(resolveRelativePath("a/b/index.html", "../c/y.css")).toBe("a/c/y.css");
    expect(resolveRelativePath("a/b/index.html", "../../root.txt")).toBe("root.txt");
  });

  it("strips query strings and hashes", () => {
    expect(resolveRelativePath("index.html", "app.js?v=2#top")).toBe("app.js");
  });

  it("returns null for external / data / anchor refs", () => {
    expect(resolveRelativePath("i.html", "https://unpkg.com/react")).toBeNull();
    expect(resolveRelativePath("i.html", "//cdn.example/x.js")).toBeNull();
    expect(resolveRelativePath("i.html", "data:image/png;base64,AAA")).toBeNull();
    expect(resolveRelativePath("i.html", "#section")).toBeNull();
    expect(resolveRelativePath("i.html", "")).toBeNull();
  });
});

describe("inlineHtmlAssets", () => {
  const files = {
    "projects/site/style.css": "body { color: red; }",
    "projects/site/js/game.js": "console.log('flap');",
    "projects/site/js/module.js": "export const x = 1;",
  };
  const read = async (p) => files[p] ?? null;

  it("inlines local stylesheets as <style> blocks", async () => {
    const html = await inlineHtmlAssets(
      `<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>`,
      "projects/site/index.html",
      read,
    );
    expect(html).toContain("<style>");
    expect(html).toContain("body { color: red; }");
    expect(html).not.toContain("<link");
  });

  it("inlines local scripts preserving attributes like type=module", async () => {
    const html = await inlineHtmlAssets(
      `<script type="module" src="js/module.js"></script>`,
      "projects/site/index.html",
      read,
    );
    expect(html).toContain('<script type="module">');
    expect(html).toContain("export const x = 1;");
    expect(html).not.toContain('src=');
  });

  it("leaves external and missing references untouched", async () => {
    const original =
      '<link rel="stylesheet" href="https://cdn.dev/lib.css">' +
      '<link rel="stylesheet" href="missing.css">' +
      '<script src="//host/x.js"></script>';
    const html = await inlineHtmlAssets(original, "projects/site/index.html", read);
    expect(html).toBe(original);
  });

  it("handles ../ traversal into sibling folders", async () => {
    const tree = { "projects/shared/base.css": ".base{}" };
    const html = await inlineHtmlAssets(
      `<link rel="stylesheet" href="../shared/base.css">`,
      "projects/site/index.html",
      async (p) => tree[p] ?? null,
    );
    expect(html).toContain(".base{}");
  });
});

describe("ensureBaseTag", () => {
  it("injects after <head>, creates head, or prepends", () => {
    expect(ensureBaseTag("<html><head><title>t</title></head>")).toContain(
      "<head><base target=\"_blank\"><title>",
    );
    expect(ensureBaseTag("<html><body>x</body>")).toContain(
      "<html><head><base target=\"_blank\"></head>",
    );
    expect(ensureBaseTag("<div>fragment</div>").startsWith('<base target="_blank">')).toBe(true);
  });
});
