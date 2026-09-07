<template>
  <div class="projects-page">
    <header class="pg-header">
      <h1 class="pg-title">Projects</h1>

      <div class="pg-tools">
        <div class="pg-search">
          <Icon icon="material-symbols:search" width="18" height="18" class="pg-search-icon" />
          <input
            v-model="query"
            type="search"
            class="pg-search-input"
            placeholder="Search projects"
            aria-label="Search projects"
          />
        </div>
        <UiButton variant="primary" @click="createProject">New</UiButton>
      </div>
    </header>

    <p v-if="error" class="pg-error">{{ error }}</p>

    <p v-if="viewState === 'loading'" class="pg-hint">Loading projects…</p>

    <div v-else-if="viewState === 'empty'" class="pg-empty-wrap">
      <p class="pg-empty-note">No projects yet.</p>
      <p class="pg-hint">
        Projects hold files you can reuse across conversations — data sets,
        documents, anything. Attach one from the Workspace panel in any chat.
      </p>
    </div>

    <p v-else-if="viewState === 'no-match'" class="pg-hint">
      No projects match “{{ query }}”.
    </p>

    <!-- File-browser style listing: one row per project, newest first. -->
    <table v-else-if="viewState === 'ready'" class="pg-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" class="col-files">Files</th>
          <th scope="col" class="col-modified">Modified</th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="proj in visibleProjects" :key="proj.name" class="pg-row">
          <td>
            <!-- A real link: the row-filling ::after keeps "click anywhere"
                 while middle-click, cmd-click and keyboard still work. -->
            <NuxtLink class="cell-name" :to="projectPath(proj.name)" :title="'Open ' + proj.name">
              <span class="proj-icon">
                <Icon icon="material-symbols:folder-outline-rounded" width="18" height="18" />
              </span>
              <span class="proj-name">{{ proj.name }}</span>
            </NuxtLink>
          </td>
          <td class="col-files proj-meta">
            {{ proj.files.length }} · {{ fmt(proj.bytes) }}
          </td>
          <td class="col-modified proj-meta">{{ relativeTime(proj.modified) || "—" }}</td>
          <td class="cell-actions" @click.stop>
            <button class="fp-mini danger" title="Delete project" @click.stop="deleteProject(proj.name)">
              <Icon icon="material-symbols:delete-outline-rounded" width="15" height="15" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
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
import { relativeTime } from "~/utils/relativeTime";

const router = useRouter();

const projects = ref([]);
const loading = ref(true);
const error = ref("");
const query = ref("");

const visibleProjects = computed(() => {
  const term = query.value.trim().toLowerCase();
  const list = term
    ? projects.value.filter((p) => p.name.toLowerCase().includes(term))
    : projects.value;
  // Most recently touched first; never-written projects fall to the bottom.
  return [...list].sort((a, b) => b.modified - a.modified);
});

/** What the body renders — one value instead of a chain of negations. */
const viewState = computed(() => {
  if (loading.value && !projects.value.length) return "loading";
  if (!projects.value.length) return "empty";
  if (!visibleProjects.value.length) return "no-match";
  return "ready";
});

async function refresh() {
  error.value = "";
  try {
    const names = await listProjectNames();
    // Projects are independent, and each listing now stats every file for
    // its mtime — no reason to pay for that one project at a time.
    projects.value = await Promise.all(names.map(describeProject));
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

function projectPath(name) {
  return `/projects/${encodeURIComponent(name)}`;
}

/**
 * Reads one project's listing into a row. A project whose directory can't
 * be read still gets a row, so it stays visible (and deletable).
 *
 * @param {string} name
 * @returns {Promise<{name: string, files: Array, bytes: number, modified: number}>}
 */
async function describeProject(name) {
  try {
    const root = await getProjectRoot(name);
    const { files } = await workspaceList("", root);
    let bytes = 0;
    let modified = 0;
    for (const file of files) {
      bytes += file.size || 0;
      modified = Math.max(modified, file.modified || 0);
    }
    return { name, files, bytes, modified };
  } catch {
    return { name, files: [], bytes: 0, modified: 0 };
  }
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
  /* Columns key off the space this page ACTUALLY gets: the sidebar and the
     right-hand dock eat into it, and a viewport query cannot see that. */
  container-type: inline-size;
}

/* Title on the left, search + New on the right. */
.pg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
}

.pg-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.pg-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pg-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--bg-primary);
}

.pg-search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.pg-search-input {
  width: 15ch;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.88rem;
}

.pg-search-input::placeholder {
  color: var(--text-placeholder);
}

.pg-error { color: var(--danger); font-size: 0.8rem; margin: 0 0 12px; }
.pg-hint { color: var(--text-secondary); font-size: 0.84rem; margin: 6px 0; }

.pg-empty-wrap {
  border: 1px dashed var(--border);
  border-radius: var(--radius-xl);
  padding: 56px 32px;
  text-align: center;
}
.pg-empty-note { margin: 0; font-size: 0.98rem; color: var(--text-primary); }

.pg-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

.pg-table th {
  padding: 0 12px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 500;
  text-align: left;
}

.pg-row {
  position: relative;
  transition: background var(--duration-fast) var(--ease-out-strong);
}

.pg-row:hover,
.pg-row:focus-within {
  background: var(--btn-hover);
}

.pg-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--muted-border);
}

.cell-name {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

/* Stretches the name link over the whole row so anywhere is clickable,
   without nesting interactive elements inside one another. */
.cell-name::after {
  content: "";
  position: absolute;
  inset: 0;
}

/* Above the stretched link so the delete button stays reachable. */
.cell-actions {
  position: relative;
  width: 1%;
  text-align: right;
}

/* Row actions stay out of the way until the row is hovered or focused. */
.fp-mini {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 5px;
  border-radius: 6px;
  display: inline-flex;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out-strong);
}
.pg-row:hover .fp-mini,
.pg-row:focus-within .fp-mini { opacity: 1; }
.fp-mini:focus-visible { opacity: 1; }
.fp-mini:hover { background: var(--btn-hover); }
.fp-mini.danger:hover { color: var(--danger); }

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
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proj-meta {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.col-files { width: 16%; }
.col-modified { width: 20%; }

/* Narrow panes drop the file-count column before the timestamp. Measured
   against the page container, so opening a dock collapses the table the same
   way a narrow window does. */
@container (max-width: 700px) {
  .col-files { display: none; }
}

/* Padding is the one thing that really is about the device rather than the
   pane, so it stays on a viewport query. */
@media (max-width: 700px) {
  .projects-page { padding: 20px 16px 48px; }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
