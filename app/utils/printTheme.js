/**
 * @file printTheme.js
 * @description Prints in the light theme. Browsers leave page backgrounds
 * out of a printout, so the dark theme's light text would land on white
 * paper.
 */

/**
 * Switches the page to the light theme while it is being printed, whether
 * printing starts from the app or from the browser's own menu.
 *
 * @param {Window} [win]
 * @returns {() => void} Stops listening and restores the theme if a print is in progress.
 */
export function useLightThemeWhilePrinting(win = window) {
  const root = win.document.documentElement;
  let wasDark = false;

  const beforePrint = () => {
    // A second beforeprint without an afterprint must not forget the theme.
    wasDark = wasDark || root.classList.contains("dark");
    root.classList.remove("dark");
  };
  const afterPrint = () => {
    if (wasDark) root.classList.add("dark");
    wasDark = false;
  };

  win.addEventListener("beforeprint", beforePrint);
  win.addEventListener("afterprint", afterPrint);
  return () => {
    win.removeEventListener("beforeprint", beforePrint);
    win.removeEventListener("afterprint", afterPrint);
    afterPrint();
  };
}
