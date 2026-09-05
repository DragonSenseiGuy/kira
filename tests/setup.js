// Ensure a usable localStorage exists before the composables are imported.
// In some runtimes (e.g. Node 26, which ships a built-in but disabled
// `localStorage` global) `window.localStorage` is `undefined` even under
// happy-dom, because happy-dom's own storage is non-enumerable and vitest's
// global wiring never surfaces it. Provide a tiny in-memory shim so the
// cached model list and other localStorage-backed composables work in tests.
function ensureLocalStorage() {
  if (typeof window === 'undefined') return;

  let usable = false;
  try {
    usable =
      !!window.localStorage &&
      typeof window.localStorage.setItem === 'function';
  } catch {
    usable = false;
  }
  if (usable) return;

  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key(index) {
        return Array.from(store.keys())[index] ?? null;
      },
      getItem(name) {
        return store.has(name) ? store.get(name) : null;
      },
      setItem(name, value) {
        store.set(String(name), String(value));
      },
      removeItem(name) {
        store.delete(name);
      },
      clear() {
        store.clear();
      },
    },
  });
}

ensureLocalStorage();

// Nuxt auto-imports `app/components/ui/*.vue` as `Ui<Name>` (and `Icon` from
// @iconify/vue via a module). Vitest has no such resolver, so components that
// use the design-system primitives would otherwise mount as unknown elements —
// assertions like `find('.send-btn').element.disabled` would silently read
// `undefined` instead of failing loudly. Register them the same way Nuxt does.
import { config } from '@vue/test-utils';
import { Icon } from '@iconify/vue';

const uiModules = import.meta.glob('../app/components/ui/*.vue', { eager: true });

for (const [filePath, module] of Object.entries(uiModules)) {
  const name = filePath.split('/').pop().replace(/\.vue$/, '');
  config.global.components[`Ui${name}`] = module.default;
}

config.global.components.Icon = Icon;
