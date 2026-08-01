import { useAuth } from "~/composables/useAuth";
import { useSettings } from "~/composables/useSettings";

/**
 * Keeps the user's own API key on their account.
 *
 * Everyone brings their own key; storing it against the account (encrypted
 * server-side) is what stops them having to paste it again on every device.
 * In local-only mode there is no account, so the key just lives in settings
 * as it always has.
 */

function canSync() {
  const { accountsEnabled, user } = useAuth();
  return accountsEnabled.value && !!user.value;
}

/**
 * Saves the key to the signed-in user's account. Safe to call in local-only
 * mode, where it does nothing.
 * @param {string} apiKey - The key, or "" to clear it
 * @returns {Promise<boolean>} Whether it was stored
 */
export async function saveApiKeyToAccount(apiKey) {
  if (!canSync()) return false;

  try {
    const res = await fetch("/api/account/api-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey || "" }),
    });
    return res.ok;
  } catch (error) {
    console.warn("[apiKey] Could not save the key to your account:", error.message);
    return false;
  }
}

/**
 * Reconciles the local key with the account's, once per sign-in.
 *
 * - Account has one, this device doesn't → pull it down (new device).
 * - This device has one, the account doesn't → push it up (first sign-in).
 * - Both → leave the local one alone; it is the more recent deliberate act
 *   on this device, and overwriting either side silently would be worse.
 */
export async function syncApiKeyWithAccount() {
  if (!canSync()) return;

  const settingsManager = useSettings();

  try {
    if (!settingsManager.isLoaded) {
      await settingsManager.loadSettings();
    }

    const local = (settingsManager.settings.custom_api_key || "").trim();

    const res = await fetch("/api/account/api-key");
    if (!res.ok) return;
    const remote = await res.json();

    if (remote.hasKey && !local) {
      settingsManager.setSetting("custom_api_key", remote.apiKey);
      await settingsManager.saveSettings();
      return;
    }

    if (!remote.hasKey && local) {
      await saveApiKeyToAccount(local);
    }
  } catch (error) {
    console.warn("[apiKey] Could not sync the key with your account:", error.message);
  }
}
