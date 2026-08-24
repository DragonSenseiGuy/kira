<template>
  <div :class="['project-page', { previewing: !!preview }]">
    <!-- Manager view -->
    <template v-if="!preview">
      <header class="pj-header">
        <button type="button" class="pv-btn" title="Back to projects" aria-label="Back to projects"
          @click="router.push('/projects')">
          <Icon icon="material-symbols:arrow-back-rounded" width="20" height="20" />
        </button>
        <div class="pj-title-wrap">
          <h1 class="pj-title">{{ name }}</h1>
          <p class="pj-meta">{{ files.length }} file{{ files.length === 1 ? "" : "s" }} · {{ fmt(totalBytes) }}</p>
        </div>
        <div class="pj-actions">
          <button type="button" class="pg-btn" @click="uploadInput?.click()">
            <Icon icon="material-symbols:upload-rounded" width="15" height="15" />Upload files
          </button>
          <button type="button" class="pg-btn danger" @click="deleteProject">
            <Icon icon="material-symbols:delete-outline-rounded" width="15" height="15" />Delete project
          </button>
        </div>
      </header>

      <p v-if="error" class="pg-error">{{ error }}</p>
      <p v-else-if="loading" class="pg-hint">Loading…</p>
      <p v-else-if="!files.length" class="pg-empty-note">
        This project is empty — upload files, or attach the project to a chat
        and ask Libre to add some.
      </p>

      <section v-else class="card-grid">
        <article v-for="f in sorted(files)" :key="f.path" class="ws-card"
          :title="'Open ' + f.path" @click="openPreview(f.path)">
          <div class="ws-head">
            <span class="ws-icon">
              <Icon :icon="fileIcon(f.path)" width="18" height="18" />
            </span>
            <span class="ws-name">{{ f.path }}</span>
          </div>
          <span class="ws-meta">
            <span class="ws-ext">{{ extOf(f.path) }}</span>
            <span class="ws-size">{{ fmt(f.size) }}</span>
          </span>
          <span class="ws-actions" @click.stop>
            <button class="fp-mini" title="Download" @click.stop="downloadFile(f.path)">
              <Icon icon="material-symbols:download-rounded" width="13" height="13" />
            </button>
            <button class="fp-mini" title="Rename" @click.stop="renameFile(f.path)">
              <Icon icon="material-symbols:drive-file-rename-outline-outline-rounded" width="13" height="13" />
            </button>
            <button class="fp-mini danger" title="Delete" @click.stop="deleteFile(f.path)">
              <Icon icon="material-symbols:delete-outline-rounded" width="13" height="13" />
            </button>
          </span>
        </article>
      </section>

      <input ref="uploadInput" type="file" multiple hidden @change="onUpload" />
    </template>

    <!-- Preview view: takes over the full content area -->
    <template v-else>
      <header class="pv-head">
        <button type="button" class="pv-btn" title="Back to files" aria-label="Back to files" @click="closePreview">
          <Icon icon="material-symbols:arrow-back-rounded" width="20" height="20" />
        </button>
        <span class="pv-path">{{ preview.path }}</span>
        <div v-if="hasRenderView" class="fp-seg" role="group" aria-label="View mode">
          <button type="button" :class="['seg-btn', { on: !codeView }]" @click="codeView = false">Preview</button>
          <button type="button" :class="['seg-btn', { on: codeView }]" @click="codeView = true">Code</button>
        </div>
        <button type="button" class="pv-btn" :title="copied ? 'Copied' : 'Copy content'" aria-label="Copy content"
          @click="copyContent">
          <Icon :icon="copied ? 'material-symbols:check-rounded' : 'material-symbols:content-copy-outline-rounded'"
            width="20" height="20" />
        </button>
        <a class="pv-btn" title="Download" href="#" @click.prevent="downloadFile(preview.path)">
          <Icon icon="material-symbols:download-rounded" width="20" height="20" />
        </a>
      </header>

      <template v-if="!codeView">
        <div v-if="preview.kind === 'html'" class="pv-body pv-frame-wrap">
          <iframe v-if="blobUrl" class="pv-frame" sandbox="allow-scripts" referrerpolicy="no-referrer"
            :src="blobUrl" title="HTML preview" />
        </div>
        <div v-else-if="preview.kind === 'svg'" class="pv-body pv-frame-wrap pv-center">
          <img :src="svgUrl" alt="SVG preview" class="pv-svg" />
        </div>
        <div v-else-if="preview.kind === 'md'" class="pv-body markdown-content" v-html="renderedMd"></div>
        <pre v-else-if="preview.kind === 'json'" class="pv-body pv-code">{{ prettyJson }}</pre>
        <pre v-else class="pv-body pv-code">{{ preview.content }}</pre>
      </template>
      <pre v-else class="pv-body pv-code">{{ preview.content }}</pre>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { Icon } from "@iconify/vue";
import { useRouter, useRoute } from "vue-router";
import { getProjectRoot, getProjectsDir } from "~/composables/workspaceSession";
import {
  workspaceList,
  workspaceRead,
  workspaceWrite,
  workspaceDelete,
  workspaceMove,
  removeChildEntry,
} from "~/utils/workspace";
import { previewKindFor } from "~/composables/useWorkspaceBrowser";
import { promptDialog, confirmDialog } from "~/composables/useDialogs";
import { emitter } from "~/composables/emitter";
import { md } from "~/utils/markdown";

const router = useRouter();
const route = useRoute();
const name = computed(() => decodeURIComponent(String(route.params.id || "")));

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const files = ref([]);
const loading = ref(true);
const error = ref("");
const uploadInput = ref(null);

async function refresh() {
  error.value = "";
  try {
    const root = await getProjectRoot(name.value);
    const listing = await workspaceList("", root);
    files.value = listing.files;
  } catch (e) {
    files.value = [];
    error.value = e.message || String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await refresh();
  emitter.on("workspace-changed", refresh);
});
onBeforeUnmount(() => emitter.off("workspace-changed", refresh));

function fmt(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const totalBytes = computed(() => files.value.reduce((n, f) => n + (f.size || 0), 0));

function sorted(list) {
  return [...list].sort((a, b) => a.path.localeCompare(b.path));
}

function extOf(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase().slice(0, 5) : "file";
}

function fileIcon(path) {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  if (["md", "markdown"].includes(ext)) return "material-symbols:description-outline-rounded";
  if (["html", "htm", "svg"].includes(ext)) return "material-symbols:html-outline-rounded";
  if (ext === "json") return "material-symbols:data-object-rounded";
  if (["js", "mjs", "ts"].includes(ext)) return "material-symbols:code-rounded";
  if (["csv", "tsv"].includes(ext)) return "material-symbols:table-outline-rounded";
  return "material-symbols:draft-outline-rounded";
}

async function deleteProject() {
  const ok = await confirmDialog({
    title: "Delete project",
    message:
      `Delete the ENTIRE project "${name.value}" and every file in it?\n` +
      `Chats attached to it will lose access. This cannot be undone.`,
    confirmLabel: "Delete project",
    danger: true,
  });
  if (!ok) return;
  try {
    await removeChildEntry(await getProjectsDir(), name.value);
    router.replace("/projects");
  } catch (e) {
    error.value = e.message || String(e);
  }
}

async function onUpload(e) {
  const list = Array.from(e.target.files || []);
  e.target.value = "";
  if (!list.length) return;
  const errors = [];
  try {
    const root = await getProjectRoot(name.value);
    for (const file of list) {
      try {
        if (file.size > MAX_UPLOAD_BYTES) {
          errors.push(`${file.name}: larger than 5 MB`);
          continue;
        }
        await workspaceWrite(`data/${file.name}`, await file.text(), root);
      } catch (err) {
        errors.push(`${file.name}: ${err.message || err}`);
      }
    }
  } catch (err) {
    errors.push(err.message || String(err));
  }
  if (errors.length) error.value = errors.join(" · ");
  await refresh();
}

async function renameFile(path) {
  const current = path.split("/").pop();
  const raw = await promptDialog({
    title: "Rename",
    message: `${name.value}/${path}`,
    initial: current,
    placeholder: "New name",
    confirmLabel: "Rename",
  });
  const newName = String(raw || "").trim();
  if (!newName || newName === current) return;
  const segments = path.split("/");
  segments[segments.length - 1] = newName;
  try {
    await workspaceMove(path, segments.join("/"), await getProjectRoot(name.value));
    await refresh();
  } catch (e) {
    error.value = e.message || String(e);
  }
}

async function deleteFile(path) {
  const ok = await confirmDialog({
    title: "Delete project file",
    message:
      `Delete "${path}" from shared project "${name.value}"? Every chat attached to this project will lose access to it.\n` +
      `This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await workspaceDelete(path, await getProjectRoot(name.value));
    await refresh();
  } catch (e) {
    error.value = e.message || String(e);
  }
}

async function downloadFile(path) {
  try {
    const root = await getProjectRoot(name.value);
    const { content } = await workspaceRead(path, root);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "file.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    error.value = e.message || String(e);
  }
}

// ---------- preview (full content-area view) ----------
const preview = ref(null); // { path, kind, content }
const codeView = ref(false);
const copied = ref(false);
const blobUrl = ref("");
const svgUrl = ref("");
let copyTimer = null;

const hasRenderView = computed(() =>
  ["html", "md", "svg", "json"].includes(preview.value?.kind),
);

const prettyJson = computed(() => {
  const p = preview.value;
  if (!p || p.kind !== "json") return "";
  try {
    return JSON.stringify(JSON.parse(p.content), null, 2);
  } catch {
    return p.content;
  }
});

const renderedMd = computed(() => {
  const p = preview.value;
  return p && p.kind === "md" ? md.render(p.content || "") : "";
});

async function openPreview(path) {
  releaseBlob();
  codeView.value = false;
  copied.value = false;
  try {
    const { content } = await workspaceRead(path, await getProjectRoot(name.value));
    const kind = previewKindFor(path);
    preview.value = { path, kind, content };
    if (kind === "html") {
      const blob = new Blob([content], { type: "text/html" });
      blobUrl.value = URL.createObjectURL(blob);
    } else if (kind === "svg") {
      svgUrl.value = `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
    }
  } catch (e) {
    error.value = e.message || String(e);
  }
}

function releaseBlob() {
  if (blobUrl.value) {
    try {
      URL.revokeObjectURL(blobUrl.value);
    } catch {}
    blobUrl.value = "";
  }
  svgUrl.value = "";
}

function closePreview() {
  releaseBlob();
  preview.value = null;
}

async function copyContent() {
  if (!preview.value?.content) return;
  try {
    await navigator.clipboard.writeText(preview.value.content);
    copied.value = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied.value = false), 1600);
  } catch (e) {
    console.warn("[project-page] copy failed:", e);
  }
}
</script>

<style scoped>
.project-page {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 28px 32px 64px;
  box-sizing: border-box;
  container-type: inline-size;
}
/* While previewing, the document IS the interface: drop the article column
   so it gets every pixel of the chat area under the TopBar. */
.project-page.previewing {
  max-width: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 60px);
}

.pj-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
}
.pj-title-wrap { flex: 1; min-width: 0; }
.pj-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pj-meta {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.pj-actions { display: flex; gap: 8px; flex-shrink: 0; }

/* Narrow containers (phones, or a phone-width slice beside sidebars):
   stack the heading — back + title on top row, actions get their own
   full-width row below instead of crushing the title. */
@container (max-width: 640px) {
  .pj-header {
    flex-wrap: wrap;
    row-gap: 12px;
  }
  .pj-title-wrap { min-width: 0; }
  .pj-actions { width: 100%; }
  .pj-actions .pg-btn { flex: 1; justify-content: center; }

  .pv-head { flex-wrap: wrap; row-gap: 8px; padding: 8px 12px; }
  .pv-path { min-width: 140px; }
}

.pg-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.pg-btn:hover { background: var(--btn-hover); color: var(--text-primary); }
.pg-btn.danger { color: var(--danger); border-color: var(--danger); }
.pg-btn.danger:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }

.pg-error { color: #dc2626; font-size: 0.8rem; margin: 0 0 12px; }
.pg-hint { color: var(--text-secondary); font-size: 0.84rem; margin: 6px 0; }
.pg-empty-note {
  color: var(--text-secondary);
  font-size: 0.9rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg, 12px);
  padding: 40px 24px;
  text-align: center;
}

/* Shared card-grid language with the projects index: same head-row anatomy
   (icon chip + name), same paddings, same container-driven columns. */
.card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@container (max-width: 999px) { .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (max-width: 759px) { .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (max-width: 509px) { .card-grid { grid-template-columns: 1fr; } }

.ws-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ws-card:hover {
  background: var(--btn-hover);
  border-color: var(--primary-a4, var(--border));
}
.ws-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ws-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(128, 128, 128, 0.14);
  color: var(--text-secondary);
  flex-shrink: 0;
}
.ws-name {
  font-size: 0.92rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ws-meta { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ws-ext {
  font-size: 0.58rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary);
  background: rgba(128, 128, 128, 0.14);
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}
.ws-size {
  font-size: 0.62rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ws-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: none;
  gap: 1px;
  background: var(--panel-bg, var(--bg-primary));
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px;
}
.ws-card:hover .ws-actions { display: inline-flex; }
.fp-mini {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 3px;
  border-radius: 5px;
  display: inline-flex;
}
.fp-mini:hover { background: var(--btn-hover); }
.fp-mini.danger:hover { color: #dc2626; }

/* Segmented control (same geometry as the dock) */
.fp-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.seg-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 9px;
  cursor: pointer;
  border-radius: 6px;
}
.seg-btn:hover { color: var(--text-primary); }
.seg-btn.on { background: var(--btn-hover); color: var(--text-primary); }

/* Preview chrome — full-area, not an overlay */
.pv-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.pv-path {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.76rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md, 8px);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.pv-btn:hover { background: var(--btn-hover); color: var(--text-primary); }
.pv-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
  margin: 0;
}
.pv-code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
}
.pv-frame-wrap { padding: 0; display: flex; }
.pv-center { align-items: center; justify-content: center; }
.pv-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
.pv-svg { max-width: 92%; max-height: 92%; }
</style>
