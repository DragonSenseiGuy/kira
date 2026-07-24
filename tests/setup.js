import modelList from './model-list-fixture.json';

const REMOTE_MODEL_LIST_URL =
  'https://raw.githubusercontent.com/Mostlime12195/Libre-Assistant-Model-List/refs/heads/main/model-list.json';

const REPO_RAW_BASE =
  'https://raw.githubusercontent.com/Mostlime12195/Libre-Assistant-Model-List/refs/heads/main';

// Populate localStorage with a cached model list before the composables are
// imported by tests. This mirrors the production behaviour where the app
// loads the cached model list immediately on startup.
if (typeof window !== 'undefined') {
  window.localStorage.setItem('libre-model-list', JSON.stringify(modelList));

  // Intercept the remote model-list and logo fetches so tests stay offline
  // and do not log network errors during the background refresh.
  const originalFetch = window.fetch;
  window.fetch = async (url, ...args) => {
    if (url === REMOTE_MODEL_LIST_URL) {
      return new Response(JSON.stringify(modelList), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (typeof url === 'string' && url.startsWith(`${REPO_RAW_BASE}/logos/`)) {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }
    return originalFetch(url, ...args);
  };
}
