import { readonly, ref } from 'vue';

/**
 * The shipped themes.
 *
 * A theme is a *pair* of palettes — one light, one dark — not a mode. The
 * dark-mode switch keeps doing exactly what it did before; the theme decides
 * which set of colours each side of that switch draws from. That is why the
 * upstream flavour names appear in `flavours` rather than as separate entries:
 * picking "Catppuccin" and then toggling dark is how you get Mocha.
 *
 * `swatch` lists the tokens the settings preview paints, in stacking order.
 * The values themselves live in `app/assets/themes.css` — the CSS is the
 * single source of truth for colour, and this registry only names things.
 */
export const THEMES = [
  {
    id: 'kira',
    name: 'Kira',
    flavours: 'Default',
    description: 'The neutral shipped palette — white page, near-black ink, blue links.',
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    flavours: 'Latte / Mocha',
    description: 'Soothing pastels. Latte in light, Mocha in dark, with the mauve accent.',
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    flavours: 'Dawn / Moon',
    description: 'All natural pine, faux fur and a bit of soho vibes.',
  },
  {
    id: 'nord',
    name: 'Nord',
    flavours: 'Snow Storm / Polar Night',
    description: 'An arctic, north-bluish palette. Cool greys, frost-blue accents.',
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    flavours: 'Light / Dark Medium',
    description: 'Retro groove — warm, earthy, high contrast.',
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    flavours: 'Day / Storm',
    description: 'Neon-lit blues and purples after dark; a crisp blue Day when the lights are on.',
  },
];

/** The theme applied when nothing is stored, or when a stored id is unknown. */
export const DEFAULT_THEME_ID = 'kira';

/**
 * localStorage key. Deliberately *not* the settings store: settings hydrate
 * asynchronously out of localforage, and a theme that arrives a few hundred
 * milliseconds after first paint is a visible flash of the wrong palette.
 */
export const THEME_STORAGE_KEY = 'kira-theme';

const THEME_IDS = new Set(THEMES.map((theme) => theme.id));

/**
 * @param {unknown} id
 * @returns {boolean} whether `id` names a shipped theme
 */
export function isThemeId(id) {
  return typeof id === 'string' && THEME_IDS.has(id);
}

/**
 * @param {string} id
 * @returns {Object} the theme's registry entry, falling back to the default
 */
export function getTheme(id) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/**
 * Read the persisted theme id.
 *
 * Anything unrecognised — a hand-edited value, or a theme removed in a later
 * release — resolves to the default rather than leaving the app unstyled.
 *
 * @returns {string} a valid theme id
 */
export function readStoredTheme() {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_ID;

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
  } catch {
    // Private-mode Safari and friends throw on any storage access.
    return DEFAULT_THEME_ID;
  }
}

// Module-level so every caller of useTheme() shares one source of truth —
// the settings picker and the command palette have to agree on what's active.
const activeTheme = ref(DEFAULT_THEME_ID);

/**
 * Write the theme onto <html> and persist it.
 *
 * Every theme — including the default — gets an explicit `data-theme`, so the
 * attribute is never "sometimes there". The settings swatches render the same
 * attribute on a nested element to preview a palette the page isn't using;
 * the default previews correctly with no rule of its own, because it *is*
 * base.css and those tokens simply inherit.
 *
 * @param {string} id theme id; unknown ids fall back to the default
 * @returns {string} the id that was actually applied
 */
export function applyTheme(id) {
  const resolved = isThemeId(id) ? id : DEFAULT_THEME_ID;
  activeTheme.value = resolved;

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
  }

  try {
    localStorage?.setItem(THEME_STORAGE_KEY, resolved);
  } catch {
    // Not being able to remember the choice shouldn't stop us honouring it.
  }

  return resolved;
}

/**
 * Apply whatever was stored. Called once on boot by the theme plugin.
 *
 * @returns {string} the id that was applied
 */
export function initTheme() {
  return applyTheme(readStoredTheme());
}

/**
 * Composable access to the active theme.
 *
 * @returns {{theme: import('vue').Ref<string>, themes: Array, setTheme: Function}}
 */
export function useTheme() {
  return {
    theme: readonly(activeTheme),
    themes: THEMES,
    setTheme: applyTheme,
  };
}
