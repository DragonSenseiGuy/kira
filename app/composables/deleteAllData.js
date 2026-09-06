/**
 * @file deleteAllData.js
 * @description Erases everything Kira has stored for this user, across all
 * four places it keeps things:
 *
 *   1. the account, when signed in (otherwise the next sign-in would just
 *      re-hydrate the chats that were "deleted"),
 *   2. localforage / IndexedDB — conversations, notepad, settings,
 *   3. OPFS — per-chat and shared project workspaces,
 *   4. localStorage — every key except the sign-in session.
 *
 * The sign-in session is deliberately left intact: this deletes data, it
 * does not close the account or sign anyone out.
 *
 * ## Ordering rule: destroy the unrecoverable copy first
 *
 * The account step runs first and is a hard gate. `conversations_metadata`
 * in localforage holds the only list of conversation ids, so it is also the
 * only way to retry the account deletions. If we cleared localforage first
 * and the server turned out to be unreachable, the account would silently
 * keep every "deleted" chat, the id list needed to retry would be gone, and
 * the next sign-in would re-hydrate the lot — while the user had been told
 * their data was deleted. So: if any account delete fails, we stop before
 * `localforage.clear()` and report, leaving the state retryable.
 *
 * Everything after that gate is independent. A failure in one of those
 * stores (no OPFS on this device, localStorage blocked in private mode)
 * is recorded but does not abort the others.
 */

import localforage from "localforage";
import { getDefaultRoot, removeChildEntry } from "~/utils/workspace";
import { useCloudSync } from "~/composables/useCloudSync";

/** Kept so the user stays signed in after their data is erased. */
const SESSION_STORAGE_KEY = "__kira_session_v1";

/** OPFS directories owned by the app (see workspaceSession.js). */
const WORKSPACE_DIRS = ["chats", "projects"];

/**
 * Deletes the signed-in account's copy of every conversation. No-op when
 * accounts are disabled or nobody is signed in — `cloudDeleteConversation`
 * checks that itself and reports success.
 *
 * The deletes are independent, so they go out concurrently rather than one
 * blocked round-trip at a time; `allSettled` also hands back the per-id
 * outcome the caller needs to decide whether it may proceed.
 *
 * @returns {Promise<string[]>} Ids whose account copy could not be deleted.
 */
async function deleteCloudConversations() {
  const { cloudDeleteConversation } = useCloudSync();
  const metadata = (await localforage.getItem("conversations_metadata")) || [];
  const ids = metadata.map((entry) => entry?.id).filter(Boolean);

  const results = await Promise.allSettled(
    ids.map((id) => cloudDeleteConversation(id)),
  );

  // A rejection shouldn't happen (the composable catches its own errors),
  // but treat it as a failure rather than trusting it.
  return ids.filter(
    (_, i) => results[i].status !== "fulfilled" || results[i].value === false,
  );
}

/** Removes the app's OPFS workspace trees. */
async function deleteWorkspaces() {
  const root = await getDefaultRoot();
  for (const dir of WORKSPACE_DIRS) {
    try {
      await removeChildEntry(root, dir);
    } catch {
      // Never created on this device — nothing to remove.
    }
  }
}

/**
 * Empties localStorage, keeping only the sign-in session.
 *
 * Deliberately a deny-list rather than a list of known keys (model caches,
 * UI preferences, …): anything a future feature stores is then erased by
 * this action automatically, which is what "delete all my data" promises.
 */
function clearLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key !== SESSION_STORAGE_KEY) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode, quota) — not fatal.
  }
}

/**
 * Erases all stored data.
 *
 * The account is cleared first and gates the rest (see the ordering rule at
 * the top of this file): if any account copy survives, nothing local is
 * touched, so the user can retry. The local stores that follow are attempted
 * independently — one unavailable store cannot leave the others behind.
 *
 * The caller is expected to reload the page afterwards: long-lived reactive
 * state (settings, the conversations list) would otherwise write itself
 * straight back out. When `errors` is non-empty the caller should keep the
 * user where they are instead, so the action can be retried.
 *
 * @returns {Promise<{errors: string[]}>} Failures, for display.
 */
export async function deleteAllData() {
  const errors = [];

  try {
    const failedIds = await deleteCloudConversations();
    if (failedIds.length) {
      errors.push(
        `account chats: ${failedIds.length} could not be deleted from your account (${failedIds.join(", ")}) — nothing was deleted from this device, so you can try again`,
      );
    }
  } catch (e) {
    errors.push(`account chats: ${e?.message || String(e)}`);
  }

  // Hard gate: the local copy is the only way to retry the account deletes,
  // so it must outlive a failure there.
  if (errors.length) return { errors };

  const localSteps = [
    ["local database", () => localforage.clear()],
    ["workspace files", deleteWorkspaces],
    ["local storage", clearLocalStorage],
  ];

  for (const [label, run] of localSteps) {
    try {
      await run();
    } catch (e) {
      errors.push(`${label}: ${e?.message || String(e)}`);
    }
  }

  return { errors };
}
