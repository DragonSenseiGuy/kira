import { computed, ref } from "vue";

/**
 * Account state for the whole app.
 *
 * Accounts only exist when the server has a database configured. When it
 * doesn't, `accountsEnabled` stays false and every route is open, which is
 * how Kira behaved before accounts existed.
 *
 * The session itself lives in an httpOnly cookie the server sets, so nothing
 * sensitive is kept in localStorage and every request is authenticated
 * automatically.
 */

const accountsEnabled = ref(false);
const user = ref(null);
const ready = ref(false);

let _pending = null;

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.statusMessage || data.message || `Request failed (${res.status})`
    );
  }

  return data;
}

/**
 * Loads `accountsEnabled` and the current user from the server. Concurrent
 * callers share one request; later calls re-use the cached result unless
 * `force` is set.
 * @param {{force?: boolean}} [options]
 */
async function loadSession({ force = false } = {}) {
  if (ready.value && !force) return;
  if (_pending) return _pending;

  _pending = (async () => {
    try {
      const data = await request("/api/auth/me");
      accountsEnabled.value = !!data.accountsEnabled;
      user.value = data.user || null;
    } catch (error) {
      // A server that can't answer shouldn't lock everyone out of a
      // local-only app, so fail open into local-only mode.
      console.warn("[auth] Could not load session:", error.message);
      accountsEnabled.value = false;
      user.value = null;
    } finally {
      ready.value = true;
      _pending = null;
    }
  })();

  return _pending;
}

export function useAuth() {
  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function login(email, password) {
    try {
      const data = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      accountsEnabled.value = true;
      user.value = data.user;
      ready.value = true;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function register(email, password) {
    try {
      const data = await request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      accountsEnabled.value = true;
      user.value = data.user;
      ready.value = true;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function logout() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.warn("[auth] Logout request failed:", error.message);
    }
    user.value = null;
  }

  return {
    accountsEnabled: computed(() => accountsEnabled.value),
    user: computed(() => user.value),
    ready: computed(() => ready.value),
    /** True when the app should be usable: either open, or signed in. */
    isAuthenticated: computed(() => !accountsEnabled.value || !!user.value),
    loadSession,
    login,
    register,
    logout,
  };
}
