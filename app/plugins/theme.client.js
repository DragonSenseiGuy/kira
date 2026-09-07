import { initTheme } from '~/composables/useTheme';

/**
 * Applies the saved theme before the app renders, and keeps the browser's
 * address-bar tint in step with it.
 *
 * Nuxt runs client plugins ahead of the root component, which is as early as
 * an SPA can act — early enough that no palette swap is ever painted.
 */
export default defineNuxtPlugin(() => {
  initTheme();

  const html = document.documentElement;

  // `theme-color` used to be a static hex in nuxt.config, which had never been
  // right in dark mode. Resolving --page instead tracks both the theme and the
  // light/dark flavour, so mobile browser chrome matches the app it frames.
  //
  // The tag is created here rather than declared in nuxt.config on purpose:
  // unhead flushes the head on its own schedule — later than `app:mounted` —
  // so a declared tag gets written *after* us and clobbers the value. Owning
  // the element outright removes the race instead of trying to win it.
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  document.head.appendChild(meta);

  const syncThemeColor = () => {
    const page = getComputedStyle(html).getPropertyValue('--page').trim();
    if (page) meta.setAttribute('content', page);
  };

  syncThemeColor();

  // Watching the element beats watching our own state: `useDark()` writes the
  // `dark` class straight onto <html>, so one observer covers both inputs
  // without this plugin having to hold a reactive scope open.
  new MutationObserver(syncThemeColor).observe(html, {
    attributeFilter: ['class', 'data-theme'],
  });
});
