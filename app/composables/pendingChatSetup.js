import { reactive } from "vue";
import { emitter } from "./emitter";
import { getChatRoot } from "./workspaceSession";
import { workspaceWrite } from "~/utils/workspace";

/**
 * Staging area for NEW chats.
 *
 * Before a conversation exists, the user can attach projects and upload
 * files from the Workspace dock ("New chat setup"). Nothing touches storage
 * yet: files live in memory as File objects, project names in this list.
 *
 * Lifecycle:
 *  - Consumed by applyPendingSetup() the moment the conversation is actually
 *    created, so its very first prompt already sees the projects attached
 *    and the files written into data/.
 *  - Cleared when the user navigates anywhere other than the new-chat screen
 *    (layout route watcher), so abandoned setups never leak into later chats.
 */

const MAX_STAGE_BYTES = 5 * 1024 * 1024; // matches live-chat upload cap

const state = reactive({
  projects: [], // project names
  files: [], // [{ id, name, size, file }] raw File objects (memory only)
});
let seq = 0;

export function stageProject(name) {
  if (!state.projects.includes(name)) state.projects.push(name);
}

export function unstageProject(name) {
  const i = state.projects.indexOf(name);
  if (i !== -1) state.projects.splice(i, 1);
}

export function toggleProject(name) {
  if (state.projects.includes(name)) unstageProject(name);
  else stageProject(name);
}

export function stageFiles(fileList) {
  for (const file of fileList) {
    state.files.push({
      id: `staged-${++seq}`,
      name: file.name,
      size: file.size,
      file,
    });
  }
}

export function removeFile(id) {
  const i = state.files.findIndex((f) => f.id === id);
  if (i !== -1) state.files.splice(i, 1);
}

export function hasPending() {
  return state.projects.length > 0 || state.files.length > 0;
}

export function clearPendingSetup() {
  state.projects.length = 0;
  state.files.length = 0;
}

/** Bundle for components; module-level functions remain for non-component callers. */
export function usePendingChatSetup() {
  return {
    state,
    stageProject,
    unstageProject,
    toggleProject,
    stageFiles,
    removeFile,
    hasPending,
    clear: clearPendingSetup,
  };
}

function takeAll() {
  const snapshot = {
    projects: [...state.projects],
    files: state.files.map((f) => ({ ...f })),
  };
  clearPendingSetup();
  return snapshot;
}

/**
 * Applies staged items to a freshly created conversation: records project
 * attachments and writes files into the chat workspace's data/ folder.
 * Safe to call with nothing staged (no-op).
 */
export async function applyPendingSetup(convoId, settingsManager) {
  const snapshot = takeAll();
  if (!snapshot.projects.length && !snapshot.files.length) return false;

  let changed = false;

  if (snapshot.projects.length) {
    const s = settingsManager.settings;
    if (!s.project_attachments || typeof s.project_attachments !== "object") {
      s.project_attachments = {};
    }
    const list = Array.isArray(s.project_attachments[convoId])
      ? s.project_attachments[convoId]
      : [];
    for (const name of snapshot.projects) {
      if (!list.includes(name)) list.push(name);
    }
    s.project_attachments[convoId] = list;
    changed = true;
  }

  const errors = [];
  if (snapshot.files.length) {
    try {
      const root = await getChatRoot(convoId);
      for (const item of snapshot.files) {
        try {
          if (item.file.size > MAX_STAGE_BYTES) {
            errors.push(`${item.name}: larger than 5 MB`);
            continue;
          }
          const text = await item.file.text();
          await workspaceWrite(`data/${item.name}`, text, root);
        } catch (e) {
          errors.push(`${item.name}: ${e.message || e}`);
        }
      }
      changed = true;
    } catch (e) {
      errors.push(e.message || String(e));
    }
  }

  if (changed) {
    try {
      settingsManager.saveSettings();
    } catch {}
    emitter.emit("workspace-changed", { at: Date.now() });
  }
  if (errors.length) {
    console.warn("[pending-setup] some items could not be applied:", errors.join(" · "));
  }
  return true;
}
