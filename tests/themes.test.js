/**
 * Tests for the theme system: app/composables/useTheme.js + app/assets/themes.css.
 *
 * The CSS carries the colour, so most of what can go wrong here is structural
 * — a theme that forgets a token silently falls back to the previous theme's
 * value and looks *almost* right, which is exactly the kind of bug nobody
 * files. These tests read the stylesheets and check the shapes line up.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  THEMES,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  isThemeId,
  getTheme,
  readStoredTheme,
  applyTheme,
  initTheme,
  useTheme,
} from "../app/composables/useTheme.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readCss(name) {
  // Comments hold prose full of colons and semicolons; drop them first so the
  // declaration regex below can stay simple.
  return readFileSync(path.join(repoRoot, "app/assets", name), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
}

/**
 * Pull the declarations out of one rule, matched by its exact selector text.
 *
 * @returns {Object<string, string>|null} property -> value, or null if absent
 */
function ruleBody(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return null;

  let depth = 0;
  let end = start;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = css.slice(css.indexOf("{", start) + 1, end);
  const declarations = {};
  for (const match of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
    declarations[match[1]] = match[2].trim();
  }
  return declarations;
}

/** Only the custom properties, dropping regular properties like scrollbar-color. */
function customProperties(declarations) {
  return Object.fromEntries(
    Object.entries(declarations).filter(([key]) => key.startsWith("--")),
  );
}

const themesCss = readCss("themes.css");
const baseCss = readCss("base.css");
const codeCss = readCss("code-blocks.css");

const blockFor = (id, mode) =>
  ruleBody(themesCss, mode === "dark" ? `[data-theme="${id}"].dark` : `[data-theme="${id}"]:not(.dark)`);

describe("theme registry", () => {
  it("ships the default first and keeps ids unique", () => {
    expect(THEMES[0].id).toBe(DEFAULT_THEME_ID);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
  });

  it("gives every theme the fields the picker renders", () => {
    for (const theme of THEMES) {
      expect(theme.name, theme.id).toBeTruthy();
      expect(theme.flavours, theme.id).toBeTruthy();
      expect(theme.description, theme.id).toBeTruthy();
    }
  });

  it("includes Catppuccin", () => {
    expect(THEMES.map((theme) => theme.id)).toContain("catppuccin");
  });

  it("resolves unknown ids to the default", () => {
    expect(isThemeId("nord")).toBe(true);
    expect(isThemeId("solarized")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(getTheme("solarized").id).toBe(DEFAULT_THEME_ID);
    expect(getTheme("nord").id).toBe("nord");
  });
});

describe("themes.css", () => {
  it("defines a light and a dark block for every registered theme", () => {
    for (const theme of THEMES) {
      expect(blockFor(theme.id, "light"), `${theme.id} light`).not.toBeNull();
      expect(blockFor(theme.id, "dark"), `${theme.id} dark`).not.toBeNull();
    }
  });

  it("declares an identical token set in every block", () => {
    // The default's light block is the reference — a theme that omits a token
    // inherits it from whatever was applied before, which reads as a subtle,
    // hard-to-report mismatch rather than an obvious break.
    const expected = Object.keys(customProperties(blockFor(DEFAULT_THEME_ID, "light"))).sort();
    expect(expected.length).toBeGreaterThan(40);

    for (const theme of THEMES) {
      for (const mode of ["light", "dark"]) {
        const tokens = Object.keys(customProperties(blockFor(theme.id, mode))).sort();
        expect(tokens, `${theme.id} ${mode}`).toEqual(expected);
      }
    }
  });

  it("sets scrollbar-color in every block", () => {
    for (const theme of THEMES) {
      for (const mode of ["light", "dark"]) {
        expect(blockFor(theme.id, mode)["scrollbar-color"], `${theme.id} ${mode}`).toBeTruthy();
      }
    }
  });

  it("only overrides tokens the design system already defines", () => {
    // Themes restyle layer 1 (primitives) and the handful of aliases the dark
    // block itself overrides. A token here that base.css/code-blocks.css never
    // declare is a typo: it would style nothing.
    const known = new Set([
      ...Object.keys(customProperties(ruleBody(baseCss, ":root"))),
      ...Object.keys(customProperties(ruleBody(baseCss, ".dark"))),
      ...Object.keys(customProperties(ruleBody(codeCss, ":root"))),
      ...Object.keys(customProperties(ruleBody(codeCss, ".dark"))),
    ]);

    for (const theme of THEMES) {
      for (const mode of ["light", "dark"]) {
        for (const token of Object.keys(customProperties(blockFor(theme.id, mode)))) {
          expect(known.has(token), `${theme.id} ${mode}: unknown token ${token}`).toBe(true);
        }
      }
    }
  });

  it("keeps the default theme byte-identical to the shipped tokens", () => {
    // `[data-theme="kira"]` restates base.css so the settings swatch can
    // preview it while another theme is applied. That duplication is only safe
    // while the two agree, so pin them together here.
    for (const [mode, selector] of [["light", ":root"], ["dark", ".dark"]]) {
      const shipped = {
        ...customProperties(ruleBody(baseCss, selector)),
        ...customProperties(ruleBody(codeCss, selector)),
      };
      const themed = customProperties(blockFor(DEFAULT_THEME_ID, mode));

      for (const [token, value] of Object.entries(themed)) {
        expect(shipped[token], `kira ${mode}: ${token}`).toBe(value);
      }
    }
  });
});

describe("applying a theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    applyTheme(DEFAULT_THEME_ID);
  });

  it("writes data-theme onto <html> and persists the choice", () => {
    applyTheme("catppuccin");
    expect(document.documentElement.dataset.theme).toBe("catppuccin");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("catppuccin");
  });

  it("always sets the attribute, including for the default", () => {
    applyTheme(DEFAULT_THEME_ID);
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME_ID);
  });

  it("falls back to the default for an unknown id", () => {
    expect(applyTheme("dracula")).toBe(DEFAULT_THEME_ID);
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME_ID);
  });

  it("restores a stored theme on boot", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "gruvbox");
    expect(readStoredTheme()).toBe("gruvbox");
    expect(initTheme()).toBe("gruvbox");
    expect(document.documentElement.dataset.theme).toBe("gruvbox");
  });

  it("ignores a stored value that no longer names a theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "monokai");
    expect(readStoredTheme()).toBe(DEFAULT_THEME_ID);
    expect(initTheme()).toBe(DEFAULT_THEME_ID);
  });

  it("shares one active theme across every caller", () => {
    const a = useTheme();
    const b = useTheme();
    a.setTheme("tokyo-night");
    expect(b.theme.value).toBe("tokyo-night");
  });
});
