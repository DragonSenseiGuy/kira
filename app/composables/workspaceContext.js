/**
 * @file workspaceContext.js — compact workspace descriptions for background
 * prompts (context compression, notepad summarization).
 *
 * These prompts previously had no idea the workspace existed. Including a
 * lightweight file listing (paths only, never contents) lets summaries
 * reference artifacts by path instead of guessing or duplicating content.
 */

import { workspaceList, workspaceRead } from "~/utils/workspace";

// IMPORTANT: workspaceSession is imported LAZILY. A static import would
// create the cycle settings → contextCompressor → workspaceContext →
// workspaceSession → useSettings → settings, re-entering useSettings while
// the Settings class is still a TDZ binding ("Cannot access 'Settings'
// before initialization").
async function session() {
  return await import("./workspaceSession");
}

const MAX_FILE_LINES = 40;
const MANIFEST_EXCERPT_CHARS = 500;

/**
 * Full workspace context for the CURRENTLY ACTIVE conversation: chat files,
 * attached project files (prefixed), and a WORKSPACE.md excerpt.
 * Returns "" when there is no active conversation or the workspace is empty.
 */
export async function collectWorkspaceContext() {
  try {
    const { getScopeSummary, getChatRoot, getProjectRoot } = await session();
    const summary = await getScopeSummary();
    if (!summary) return "";

    const lines = [];
    const chat = await workspaceList("", await getChatRoot(summary.convoId));
    for (const f of chat.files) lines.push(`- ${f.path}`);

    for (const name of summary.attached || []) {
      try {
        const listing = await workspaceList("", await getProjectRoot(name));
        for (const f of listing.files) lines.push(`- projects/${name}/${f.path}`);
      } catch {}
    }

    if (!lines.length) return "";

    const shown = lines.slice(0, MAX_FILE_LINES);
    const more = lines.length > shown.length ? `\n(+${lines.length - shown.length} more)` : "";

    let manifest = "";
    try {
      const read = await workspaceRead("WORKSPACE.md", await getChatRoot(summary.convoId));
      manifest = (read.content || "").trim().slice(0, MANIFEST_EXCERPT_CHARS);
    } catch {}

    let out =
      `<workspace_files>\n` +
      `The conversation's workspace contains (reference by path; do not duplicate contents):\n` +
      shown.join("\n") +
      more +
      `\n</workspace_files>`;

    if (manifest) out += `\n\n<workspace_manifest>\n${manifest}\n</workspace_manifest>`;
    return out;
  } catch {
    return "";
  }
}

/**
 * Global (cross-chat) context: just the shared project library names.
 * Safe to include in prompts that summarize OTHER conversations, where the
 * active chat's own files would be misattributed.
 */
export async function collectProjectNames() {
  try {
    const { listProjectNames } = await session();
    const names = await listProjectNames();
    return names.length ? names : [];
  } catch {
    return [];
  }
}
