<template>
  <div class="projects-page">
    <header class="pg-header">
      <div>
        <h1 class="pg-title">Projects</h1>
        <p class="pg-subtitle">
          Shared file libraries any chat can attach to.
          {{ projects.length ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : "" }}
        </p>
      </div>
    </header>

    <p v-if="error" class="pg-error">{{ error }}</p>
    <p v-if="loading && !projects.length" class="pg-hint">Loading projects…</p>

    <div v-else-if="!projects.length" class="pg-empty-wrap">
      <p class="pg-empty-note">No projects yet.</p>
      <p class="pg-hint">
        Projects hold files you can reuse across conversations — data sets,
        documents, anything. Attach one from the Workspace panel in any chat.
      </p>
    </div>

    <!-- Gallery of project cards -->
    <section v-else class="proj-grid">
      <article v-for="proj in projects" :key="proj.name" class="proj-card"
        :title="'Open ' + proj.name" @click="open(proj.name)">
        <div class="proj-head">
          <span class="proj-icon">
            <Icon icon="material-symbols:folder-outline-rounded" width="18" height="18" />
          </span>
          <span class="proj-name">{{ proj.name }}</span>
        </div>
        <span class="proj-meta">{{ proj.files.length }} file{{ proj.files.length === 1 ? "" : "s" }} ·
          {{ fmt(proj.bytes) }}</span>
        <span class="ws-actions" @click.stop>
          <button class="fp-mini danger" title="Delete project" @click.stop="deleteProject(proj.name)">
            <Icon icon="material-symbols:delete-outline-rounded" width="13" height="13" />
          </button>
        </span>
      </article>

      <button type="button" class="proj-card new" @click="createProject">
        <Icon icon="material-symbols:add-rounded" width="20" height="20" />
        <span>New project</span>
      </button>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { Icon } from "@iconify/vue";
import { useRouter } from "vue-router";
import {
  listProjectNames,
  getProjectRoot,
  getProjectsDir,
} from "~/composables/workspaceSession";
import { workspaceList, removeChildEntry, ensureWorkspaceSeeded } from "~/utils/workspace";
import { promptDialog, confirmDialog } from "~/composables/useDialogs";
import { emitter } from "~/composables/emitter";

const router = useRouter();

const projects = ref([]);
const loading = ref(true);
const error = ref("");

async function refresh() {
  error.value = "";
  try {
    const names = await listProjectNames();
    const out = [];
    for (const name of names) {
      try {
        const root = await getProjectRoot(name);
        const listing = await workspaceList("", root);
        out.push({
          name,
          files: listing.files,
          bytes: listing.files.reduce((n, f) => n + (f.size || 0), 0),
        });
      } catch {
        out.push({ name, files: [], bytes: 0 });
      }
    }
    projects.value = out;
  } catch (e) {
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

function cleanName(raw) {
  return String(raw || "").trim().replace(/[\\/:*?"<>|]/g, "-");
}

function open(name) {
  router.push(`/projects/${encodeURIComponent(name)}`);
}

async function createProject() {
  const raw = await promptDialog({
    title: "New project",
    message: "Projects are shared libraries any chat can attach to.",
    placeholder: "project-name",
    confirmLabel: "Create",
  });
  const name = cleanName(raw);
  if (!name) return;
  try {
    const root = await getProjectRoot(name);
    await ensureWorkspaceSeeded(root, `Project · ${name}`);
    await refresh();
    router.push(`/projects/${encodeURIComponent(name)}`);
  } catch (e) {
    error.value = e.message || String(e);
  }
}

async function deleteProject(name) {
  const ok = await confirmDialog({
    title: "Delete project",
    message:
      `Delete the ENTIRE project "${name}" and every file in it?\n` +
      `Chats attached to it will lose access. This cannot be undone.`,
    confirmLabel: "Delete project",
    danger: true,
  });
  if (!ok) return;
  try {
    await removeChildEntry(await getProjectsDir(), name);
    await refresh();
  } catch (e) {
    error.value = e.message || String(e);
  }
}
</script>

<style scoped>
.projects-page {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 28px 32px 64px;
  box-sizing: border-box;
  /* Column counts key off the space this page ACTUALLY gets (viewport
     queries can't see the sidebars eating into it). */
  container-type: inline-size;
}
.pg-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.pg-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}
.pg-subtitle {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.pg-error { color: #dc2626; font-size: 0.8rem; margin: 0 0 12px; }
.pg-hint { color: var(--text-secondary); font-size: 0.84rem; margin: 6px 0; }
.pg-empty-wrap {
  border: 1px dashed var(--border);
  border-radius: var(--radius-xl, 16px);
  padding: 56px 32px;
  text-align: center;
}
.pg-empty-note { margin: 0; font-size: 0.98rem; color: var(--text-primary); }

/* Dense card grid with HARD column counts — measured against the page
   container, not the viewport, so open sidebars reduce column count
   gracefully instead of cramming four giant-stretch columns into scraps. */
.proj-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@container (max-width: 999px) { .proj-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (max-width: 759px) { .proj-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (max-width: 509px) { .proj-grid { grid-template-columns: 1fr; } }
.proj-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-primary);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  text-align: left;
}
.proj-card:hover {
  background: var(--btn-hover);
  border-color: var(--primary-a4, var(--border));
}

.proj-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
button.proj-card {
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-style: dashed;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.84rem;
  font-weight: 500;
  min-height: 86px;
}
button.proj-card:hover {
  background: transparent;
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.proj-icon {
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
.proj-name {
  font-size: 0.92rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-meta {
  font-size: 0.74rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.proj-name {
  font-size: 0.95rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proj-meta {
  font-size: 0.74rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.ws-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
  gap: 1px;
  background: var(--panel-bg, var(--bg-primary));
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px;
}
.proj-card:hover .ws-actions { display: inline-flex; }
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
</style>
