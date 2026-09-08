/**
 * @file useWorkspaceBrowser.js
 * @description Reactive bridge between the Files panel UI and the scoped
 * workspace filesystem. Owns listing, previewing, upload/download,
 * delete/rename, project attach/detach and the storage meter.
 */

import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { zipSync, strToU8 } from "fflate";
import { emitter } from "./emitter";
import { useSettings } from "./useSettings";
import {
  workspaceRead,
  workspaceDelete,
  workspaceMove,
  workspaceWrite,
  workspaceList,
  ensureWorkspaceSeeded,
  buildWorkspaceManifest,
  formatBytes as fmtBytes,
} from "~/utils/workspace";
import {
  isFileToolsAvailable,
  getActiveConversation,
  onWorkspaceScopeChange,
  getChatRoot,
  getProjectRoot,
  listProjectNames,
  resolveScopePath,
} from "./workspaceSession";

function extOf(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "";
}

/** What kind of preview renderer should handle this entry? */
export function previewKindFor(path) {
  const ext = extOf(path);
  if (["md", "markdown"].includes(ext)) return "md";
  if (["html", "htm", "svg"].includes(ext)) return "html";
  if (ext === "json") return "json";
  return "text";
}

export function useWorkspaceBrowser() {
  const settingsManager = useSettings();

  const available = ref(false); // false while incognito / no active chat
  const loading = ref(false);
  const error = ref("");

  const chatFiles = ref([]); // [{path,size,mtime}]
  const attachedProjects = ref([]); // ["name"]
  const projectFiles = ref({}); // name -> [{path,size,mtime}]
  const library = ref([]); // [{name, files, bytes}]
  const usage = ref({ usage: null, quota: null });

  const preview = ref(null); // {displayPath, scopePath, content, kind}
  const busy = ref(false);

  let unsubs = [];

  async function safeList(rootHandle, rel = "") {
    try {
      return await workspaceList(rel, rootHandle);
    } catch {
      return { files: [], truncated: false };
    }
  }

  async function refresh() {
    error.value = "";
    available.value = isFileToolsAvailable();
    loading.value = true;
    try {
      // Chat-scoped listing (only when a conversation is active).
      if (available.value) {
        const convoId = getActiveConversation();
        const attached = Array.isArray(
          settingsManager.settings.project_attachments?.[convoId],
        )
          ? settingsManager.settings.project_attachments[convoId]
          : [];
        attachedProjects.value = attached;

        const chatRoot = await getChatRoot(convoId);
        await ensureWorkspaceSeeded(chatRoot, "This chat's workspace");
        const chatListing = await safeList(chatRoot);
        chatFiles.value = chatListing.files;

        const pf = {};
        for (const name of attached) {
          const root = await getProjectRoot(name);
          const listing = await safeList(root);
          pf[name] = listing.files;
        }
        projectFiles.value = pf;
      } else {
        chatFiles.value = [];
        projectFiles.value = {};
        attachedProjects.value = [];
        preview.value = null;
      }

      // Project library + storage usage: GLOBAL — always available, even
      // on fresh tabs and non-chat routes.
      const names = await listProjectNames();
      const lib = [];
      for (const name of names) {
        const listing = await safeList(await getProjectRoot(name));
        lib.push({
          name,
          files: listing.files.length,
          bytes: listing.files.reduce((sum, f) => sum + (f.size || 0), 0),
          attached: attachedProjects.value.includes(name),
        });
      }
      library.value = lib;

      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          usage.value = { usage: est.usage ?? null, quota: est.quota ?? null };
        } catch {}
      }
    } catch (e) {
      error.value = e.message || String(e);
    } finally {
      loading.value = false;
    }
  }

  async function createProject(name) {
    const clean = String(name || "").trim().replace(/[\\/]/g, "-");
    if (!clean) throw new Error("Project needs a name.");
    const root = await getProjectRoot(clean);
    await ensureWorkspaceSeeded(root, `Project · ${clean}`);
    await attachProject(clean).catch(() => {});
    await refresh();
    return clean;
  }

  async function attachProject(name) {
    const convoId = getActiveConversation();
    if (!convoId) throw new Error("No active conversation.");
    const s = settingsManager.settings;
    if (!s.project_attachments || typeof s.project_attachments !== "object") {
      s.project_attachments = {};
    }
    const list = Array.isArray(s.project_attachments[convoId])
      ? s.project_attachments[convoId]
      : [];
    if (!list.includes(name)) list.push(name);
    s.project_attachments[convoId] = list;
    settingsManager.saveSettings();
    await refresh();
  }

  async function detachProject(name) {
    const convoId = getActiveConversation();
    if (!convoId) return;
    const s = settingsManager.settings;
    const list = s.project_attachments?.[convoId];
    if (Array.isArray(list)) {
      s.project_attachments[convoId] = list.filter((n) => n !== name);
      settingsManager.saveSettings();
    }
    await refresh();
  }

  /** Resolves a panel entry (which may belong to an attached project). */
  async function resolveEntry(displayPath) {
    return resolveScopePath(displayPath);
  }

  async function openPreview(displayPath) {
    busy.value = true;
    try {
      const s = await resolveEntry(displayPath);
      const { content } = await workspaceRead(s.rel, s.root);
      preview.value = {
        displayPath,
        content,
        kind: previewKindFor(displayPath),
      };
    } catch (e) {
      error.value = e.message || String(e);
    } finally {
      busy.value = false;
    }
  }

  /** Raw read by display path (used by the HTML preview inliner). */
  async function readEntryText(displayPath) {
    const s = await resolveEntry(displayPath);
    return (await workspaceRead(s.rel, s.root)).content;
  }

  function closePreview() {
    preview.value = null;
  }

  async function deleteEntry(displayPath) {
    const s = await resolveEntry(displayPath);
    await workspaceDelete(s.rel, s.root);
    if (preview.value?.displayPath === displayPath) closePreview();
    await refresh();
  }

  async function renameEntry(displayPath, newName) {
    const clean = String(newName || "").trim().replace(/\//g, "-");
    if (!clean) throw new Error("Name required.");
    const s = await resolveEntry(displayPath);
    const segments = s.rel.split("/");
    segments[segments.length - 1] = clean;
    await workspaceMove(s.rel, segments.join("/"), s.root);
    await refresh();
  }

  async function createFile(parentDir = "", name = "untitled.txt") {
    const path = parentDir ? `${parentDir}/${name}` : name;
    const s = await resolveScopePath(path);
    await workspaceWrite(s.rel, "", s.root);
    await refresh();
    return path;
  }

  async function createFolder(parentDir = "", name = "new-folder") {
    const clean = String(name).trim().replace(/[\\/]/g, "-");
    const path = parentDir ? `${parentDir}/${clean}/.keep` : `${clean}/.keep`;
    await createFile("", path);
    return parentDir ? `${parentDir}/${clean}` : clean;
  }

  /**
   * Uploads text files. With an active chat they land in its /data folder;
   * without one they go into the given project (required in that case).
   */
  async function uploadFiles(fileList, targetDir = "data", projectName = null) {
    const errors = [];
    for (const file of fileList) {
      try {
        if (file.size > 5 * 1024 * 1024) {
          errors.push(`${file.name}: larger than 5 MB`);
          continue;
        }
        const text = await file.text();
        const path = targetDir ? `${targetDir}/${file.name}` : file.name;
        if (projectName) {
          const root = await getProjectRoot(projectName);
          await workspaceWrite(path, text, root);
        } else {
          const s = await resolveScopePath(path);
          await workspaceWrite(s.rel, text, s.root);
        }
      } catch (e) {
        errors.push(`${file.name}: ${e.message || e}`);
      }
    }
    await refresh();
    if (errors.length) error.value = errors.join(" · ");
    return errors.length === 0;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function downloadFile(displayPath) {
    const s = await resolveEntry(displayPath);
    const { content } = await workspaceRead(s.rel, s.root);
    triggerDownload(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
      displayPath.split("/").pop(),
    );
  }

  async function downloadAllZip() {
    const input = {};
    const addScope = async (rootHandle, prefix, files) => {
      for (const f of files) {
        if (f.path.endsWith("/.keep")) continue;
        const { content } = await workspaceRead(f.path, rootHandle);
        input[prefix ? `${prefix}/${f.path}` : f.path] = strToU8(content);
      }
    };
    // Chat scope when available; the ENTIRE project library always.
    if (available.value && chatFiles.value.length) {
      const chatRoot = await getChatRoot();
      await addScope(chatRoot, "", chatFiles.value);
    }
    for (const proj of library.value) {
      const listing = await safeList(await getProjectRoot(proj.name));
      await addScope(await getProjectRoot(proj.name), `projects/${proj.name}`, listing.files);
    }
    const zipped = zipSync(input, { level: 6 });
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(new Blob([zipped], { type: "application/zip" }), `libre-workspace-${stamp}.zip`);
  }

  const totalBytes = computed(() => {
    const all = [
      ...chatFiles.value,
      ...Object.values(projectFiles.value).flat(),
    ];
    return all.reduce((s, f) => s + (f.size || 0), 0);
  });

  onMounted(() => {
    refresh();
    // NOTE: mitt's .on() returns undefined — wrap removal explicitly.
    emitter.on("workspace-changed", refresh);
    unsubs.push(() => emitter.off("workspace-changed", refresh));
    unsubs.push(onWorkspaceScopeChange(refresh));
  });
  onBeforeUnmount(() => unsubs.forEach((unsub) => typeof unsub === "function" && unsub()));

  return {
    // state
    available,
    loading,
    busy,
    error,
    chatFiles,
    attachedProjects,
    projectFiles,
    library,
    usage,
    preview,
    totalBytes,
    formatBytes: fmtBytes,
    // actions
    refresh,
    createProject,
    attachProject,
    detachProject,
    openPreview,
    closePreview,
    readEntryText,
    deleteEntry,
    renameEntry,
    createFile,
    createFolder,
    uploadFiles,
    downloadFile,
    downloadAllZip,
  };
}
