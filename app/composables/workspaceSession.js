/**
 * @file workspaceSession.js
 * @description Scoping layer between the AI's file tools and the physical
 * OPFS store. Every conversation gets an isolated root at
 *   /chats/<convoId>/
 * and may additionally be granted access to shared projects at
 *   /projects/<name>/
 *
 * Tool paths are workspace-relative. Paths that begin with `projects/<name>/`
 * route into that project — but ONLY if it is attached to the active
 * conversation. Everything else resolves inside the conversation's private
 * root. Cross-chat access is therefore structurally impossible.
 *
 * When no conversation is active (incognito mode, or the app just loaded),
 * file tools are unavailable: incognito promises "nothing is stored", so it
 * never touches persistent storage at all.
 */

import { getDefaultRoot, getSubdirectory, removeChildEntry } from "~/utils/workspace";
import { useSettings } from "./useSettings";

let activeConvoId = null;
const listeners = new Set();

/** Called by messagesManager whenever the visible conversation changes. */
export function setActiveConversation(convoId) {
  const next = convoId || null;
  if (activeConvoId === next) return;
  activeConvoId = next;
  for (const fn of listeners) {
    try {
      fn(activeConvoId);
    } catch {}
  }
}

export function getActiveConversation() {
  return activeConvoId;
}

export function onWorkspaceScopeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** File tools require an active, non-incognito conversation. */
export function isFileToolsAvailable() {
  return !!activeConvoId;
}

function attachmentsFor(convoId) {
  try {
    const map = useSettings().settings.project_attachments;
    const list = map?.[convoId];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Splits a model-supplied path into its target scope.
 *
 * @param {string} rawPath - Workspace-relative path ("report.md" or
 *   "projects/budget/data/2026.csv").
 * @param {Object} [options]
 * @param {string[]} [options.attached] - Project names attached to the chat.
 * @returns {{scope:'chat', rel:string} | {scope:'project', name:string, rel:string}}
 */
export function splitScopedPath(rawPath, options = {}) {
  const normalized = String(rawPath ?? "").replace(/^\//, "");
  const parts = normalized.split("/").filter(Boolean);

  if (parts[0] === "projects" && parts.length >= 2) {
    return { scope: "project", name: parts[1], rel: parts.slice(2).join("/") };
  }
  void options;
  return { scope: "chat", rel: normalized };
}

async function chatsDir() {
  return getSubdirectory(await getDefaultRoot(), "chats", { create: true });
}

export async function getChatRoot(convoId = activeConvoId) {
  if (!convoId) throw new Error("No active conversation.");
  return getSubdirectory(await chatsDir(), convoId, { create: true });
}

export async function getProjectsDir() {
  return getSubdirectory(await getDefaultRoot(), "projects", { create: true });
}

export async function getProjectRoot(name) {
  return getSubdirectory(await getProjectsDir(), name, { create: true });
}

/**
 * Permanently removes a conversation's private workspace. Called when the
 * user deletes the conversation — privacy-first default.
 */
export async function deleteChatWorkspace(convoId) {
  if (!convoId) return;
  try {
    const chats = await chatsDir();
    await removeChildEntry(chats, convoId);
    // Drop attachment records too.
    try {
      const s = useSettings().settings;
      if (s.project_attachments?.[convoId]) {
        delete s.project_attachments[convoId];
        useSettings().saveSettings();
      }
    } catch {}
  } catch {
    // Directory may not exist yet — nothing to remove.
  }
}

/** Lists every project in the library (names only). */
export async function listProjectNames() {
  const dir = await getProjectsDir();
  const names = [];
  if (typeof dir.keys === "function") {
    for await (const key of dir.keys()) names.push(key);
  } else {
    for await (const [name] of dir.entries()) names.push(name);
  }
  return names.sort();
}

/**
 * Resolves a model path to a concrete directory handle + relative remainder,
 * enforcing attachment rules.
 *
 * @param {string} rawPath
 * @param {Object} [options]
 * @param {string} [options.convoId=active]
 * @param {string[]} [options.attached] - Overrides settings-derived attachments.
 * @returns {Promise<{root: object, rel: string, scope: string, projectName?: string}>}
 */
export async function resolveScopePath(rawPath, options = {}) {
  const convoId = options.convoId ?? activeConvoId;
  if (!convoId) {
    throw new Error(
      "File tools are unavailable in this mode (nothing is stored in incognito, and no chat is active).",
    );
  }
  const attached =
    options.attached ?? attachmentsFor(convoId);
  const split = splitScopedPath(rawPath, { attached });

  if (split.scope === "project") {
    if (!split.rel) {
      throw new Error("A file name is required after the project folder.");
    }
    if (!attached.includes(split.name)) {
      throw new Error(
        `Project "${split.name}" is not attached to this conversation. The user can attach it from the Files panel.`,
      );
    }
    return {
      root: await getProjectRoot(split.name),
      rel: split.rel,
      scope: "project",
      projectName: split.name,
    };
  }

  return { root: await getChatRoot(convoId), rel: split.rel, scope: "chat" };
}

/**
 * Roots a conversation should expose: its private root plus any attached
 * project roots. Used by the Files panel and seeding.
 */
export async function getScopeSummary() {
  const convoId = activeConvoId;
  if (!convoId) return null;
  const attached = attachmentsFor(convoId);
  const roots = [{ label: "This chat", name: null }];
  for (const name of attached) {
    roots.push({ label: `Project · ${name}`, name });
  }
  return { convoId, attached, roots };
}
