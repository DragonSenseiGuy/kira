/**
 * @file deleteAllData.js
 * @description Erases everything Kira has stored for this user, across all
 * four places it keeps things:
 *
 *   1. the account, when signed in (otherwise the next sign-in would just
 *      re-hydrate the chats that were "deleted"),
 *   2. localforage / IndexedDB — conversations, notepad, settings,
 *   3. OPFS — per-chat and shared project workspaces,
 *   4. localStorage — model list caches and UI preferences.
 *
 * The sign-in session is deliberately left intact: this deletes data, it
 * does not close the account or sign anyone out.
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
 * checks that itself.
 */
async function deleteCloudConversations() {
  const { cloudDeleteConversation } = useCloudSync();
  const metadata = (await localforage.getItem("conversations_metadata")) || [];
  for (const entry of metadata) {
    if (entry?.id) await cloudDeleteConversation(entry.id);
  }
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

/** Drops every localStorage key except the session token. */
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
 * Erases all stored data. Individual layers are attempted independently so
 * one unavailable store (no OPFS, cloud unreachable) cannot leave the rest
 * of the data behind.
 *
 * The caller is expected to reload the page afterwards: long-lived reactive
 * state (settings, the conversations list) would otherwise write itself
 * straight back out.
 *
 * @returns {Promise<{errors: string[]}>} Non-fatal failures, for display.
 */
export async function deleteAllData() {
  const errors = [];

  const steps = [
    ["account chats", deleteCloudConversations],
    ["local database", () => localforage.clear()],
    ["workspace files", deleteWorkspaces],
    ["cached preferences", clearLocalStorage],
  ];

  for (const [label, run] of steps) {
    try {
      await run();
    } catch (e) {
      errors.push(`${label}: ${e?.message || String(e)}`);
    }
  }

  return { errors };
}
