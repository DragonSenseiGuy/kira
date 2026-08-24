<template>
  <div class="workspace-dock-wrapper">
    <div :class="['workspace-dock-overlay', { active: isOpen && isMobile }]" @click="closePanel"></div>

    <div class="workspace-dock" :class="{ active: isOpen }" role="dialog" aria-label="Workspace">
      <!-- Header -->
      <div class="panel-header">
        <span class="panel-title">Workspace</span>
        <div class="header-actions">
          <button v-if="wb.available.value" class="action-btn" title="Refresh" aria-label="Refresh files"
            @click="wb.refresh()">
            <Icon icon="material-symbols:refresh-rounded" width="20" height="20" />
          </button>
          <button class="action-btn" @click="closePanel" aria-label="Close panel">
            <Icon icon="material-symbols:close" width="20" height="20" />
          </button>
        </div>
      </div>

      <div class="panel-content">
        <!-- Unavailable (incognito / no active chat) -->
        <div class="fp-toolbar">
          <span class="fp-toolbar-note">{{ wb.available.value ? totalItems + (totalItems === 1 ? " item" : " items") : (isIncognito ? "No active chat" : "New chat setup") }}</span>
          <div v-if="wb.available.value && hasAnyFiles" class="fp-seg" role="group" aria-label="Layout">
            <button type="button" :class="['seg-btn', { on: viewMode === 'gallery' }]"
              @click="setViewMode('gallery')">Gallery</button>
            <button type="button" :class="['seg-btn', { on: viewMode === 'tree' }]"
              @click="setViewMode('tree')">Tree</button>
          </div>

          <!-- New-chat staging: files upload straight into a staging list;
               projects are attached from the Projects panel below, exactly
               like in a live chat — just aimed at your NEXT chat instead. -->
          <template v-if="!wb.available.value && !isIncognito">
            <button type="button" class="fp-tool" title="Stage files for the next chat (max 5 MB each)"
              @click="stageInputRef?.click()">
              <Icon icon="material-symbols:upload-rounded" width="14" height="14" />Upload
            </button>
            <input ref="stageInputRef" type="file" multiple hidden @change="onStageUpload" />
          </template>

          <!-- Live chat controls -->
          <template v-if="wb.available.value">
            <button type="button" class="fp-tool" title="Upload into this chat's /data folder"
              @click="liveInputRef?.click()">
              <Icon icon="material-symbols:upload-rounded" width="14" height="14" />Upload
            </button>
            <input ref="liveInputRef" type="file" multiple hidden @change="onUpload" />
            <button type="button" class="fp-tool" title="Download everything (.zip)" @click="wb.downloadAllZip">
              <Icon icon="material-symbols:download-rounded" width="14" height="14" />Export
            </button>
          </template>
        </div>

        <div v-if="wb.error.value" class="fp-error">{{ wb.error.value }}</div>

        <!-- No active chat: incognito notice, or staging list for new chats -->
        <template v-if="!wb.available.value && !isIncognito">
          <div v-if="!pending.state.projects.length && !pending.state.files.length" class="fp-empty">
            <p>
              Attach projects or upload files for the next chat.
            </p>
          </div>
          <template v-else>
            <div class="fp-group-head"><span>Staged for your next chat</span></div>
            <div v-for="name in pending.state.projects" :key="'sp-' + name" class="fp-row lib">
              <Icon icon="material-symbols:bookmarks-outline-rounded" width="14" height="14" class="fp-row-icon" />
              <span class="fp-name">{{ name }}</span>
              <span class="fp-actions always" @click.stop>
                <button class="fp-mini danger" title="Don't attach this project" @click="pending.unstageProject(name)">
                  <Icon icon="material-symbols:close-rounded" width="12" height="12" />
                </button>
              </span>
            </div>
            <div v-for="f in pending.state.files" :key="f.id" class="fp-row lib">
              <Icon :icon="iconFor({ entry: f, dir: false })" width="14" height="14" class="fp-row-icon" />
              <span class="fp-name" :title="f.name">{{ f.name }}</span>
              <span class="fp-size">{{ wb.formatBytes(f.size) }}</span>
              <span class="fp-actions always" @click.stop>
                <button class="fp-mini danger" title="Remove file" @click="pending.removeFile(f.id)">
                  <Icon icon="material-symbols:close-rounded" width="12" height="12" />
                </button>
              </span>
            </div>
          </template>
        </template>

        <div v-if="!wb.available.value && isIncognito" class="fp-empty">
          <p>Incognito mode stores nothing — there's no workspace here.</p>
        </div>

        <template v-if="wb.available.value">
          <p v-if="!wb.chatFiles.value.length && !wb.loading.value" class="fp-hint">
            Empty — ask Libre to create something.
          </p>

          <!-- Gallery (default): artifacts-first cards, folders flattened away -->
          <template v-if="viewMode === 'gallery'">
            <div v-if="wb.chatFiles.value.length" class="card-grid">
              <article v-for="f in flatten(wb.chatFiles.value)" :key="'g-' + f.path" class="ws-card"
                :title="'Open ' + f.path" @click="wb.openPreview(f.path)">
                <Icon :icon="iconFor({ entry: f, dir: false })" width="18" height="18" class="ws-icon" />
                <span class="ws-name">{{ f.path.split("/").pop() }}</span>
                <span class="ws-meta">
                  <span class="ws-ext">{{ extOf(f.path) }}</span>
                  <span class="ws-size">{{ wb.formatBytes(f.size) }}</span>
                </span>
                <span class="ws-actions" @click.stop>
                  <button class="fp-mini" title="Download" @click.stop="wb.downloadFile(f.path)">
                    <Icon icon="material-symbols:download-rounded" width="13" height="13" />
                  </button>
                  <button class="fp-mini" title="Rename" @click.stop="doRename(f.path)">
                    <Icon icon="material-symbols:drive-file-rename-outline-outline-rounded" width="13" height="13" />
                  </button>
                  <button class="fp-mini danger" title="Delete" @click.stop="doDelete(f.path)">
                    <Icon icon="material-symbols:delete-outline-rounded" width="13" height="13" />
                  </button>
                </span>
              </article>
            </div>

            <!-- Attached projects -->
            <template v-for="(files, name) in wb.projectFiles.value" :key="'pg-' + name">
              <div class="fp-group-head">
                <span>Project · {{ name }}</span>
                <button class="fp-mini" title="Detach from this chat" @click="wb.detachProject(name)">
                  <Icon icon="material-symbols:link-off-rounded" width="12" height="12" />
                </button>
              </div>
              <p v-if="!files.length" class="fp-hint">No files yet.</p>
              <div v-else class="card-grid">
                <article v-for="f in flatten(files)" :key="'pgf-' + name + '-' + f.path" class="ws-card"
                  :title="'Open projects/' + name + '/' + f.path"
                  @click="wb.openPreview(`projects/${name}/${f.path}`)">
                  <Icon :icon="iconFor({ entry: f, dir: false })" width="18" height="18" class="ws-icon" />
                  <span class="ws-name">{{ f.path.split("/").pop() }}</span>
                  <span class="ws-meta">
                    <span class="ws-ext">{{ extOf(f.path) }}</span>
                    <span class="ws-size">{{ wb.formatBytes(f.size) }}</span>
                  </span>
                  <span class="ws-actions" @click.stop>
                    <button class="fp-mini" title="Download" @click.stop="downloadProjectFile(name, f.path)">
                      <Icon icon="material-symbols:download-rounded" width="13" height="13" />
                    </button>
                    <button class="fp-mini" title="Rename" @click.stop="doRenameProjectFile(name, f.path)">
                      <Icon icon="material-symbols:drive-file-rename-outline-outline-rounded" width="13" height="13" />
                    </button>
                    <button class="fp-mini danger" title="Delete" @click.stop="doDeleteProjectFile(name, f.path)">
                      <Icon icon="material-symbols:delete-outline-rounded" width="13" height="13" />
                    </button>
                  </span>
                </article>
              </div>
            </template>
          </template>

          <!-- Tree (secondary view) -->
          <template v-else>
          <template v-for="row in treeRows(wb.chatFiles.value)" :key="'c-' + row.entry.path">
            <div class="fp-row" :style="{ paddingLeft: 4 + row.depth * 12 + 'px' }"
              @click="onRowClick(row)">
              <Icon :icon="iconFor(row)" width="15" height="15" class="fp-row-icon" :class="{ dim: row.dir }" />
              <span class="fp-name" :title="row.entry.path">{{ row.label }}</span>
              <span class="fp-size">{{ wb.formatBytes(row.entry.size) }}</span>
              <span v-if="!row.dir" class="fp-actions" @click.stop>
                <button class="fp-mini" title="Download" @click="wb.downloadFile(row.entry.path)">
                  <Icon icon="material-symbols:download-rounded" width="13" height="13" />
                </button>
                <button class="fp-mini" title="Rename" @click="doRename(row.entry.path)">
                  <Icon icon="material-symbols:drive-file-rename-outline-outline-rounded" width="13" height="13" />
                </button>
                <button class="fp-mini danger" title="Delete" @click="doDelete(row.entry.path)">
                  <Icon icon="material-symbols:delete-outline-rounded" width="13" height="13" />
                </button>
              </span>
            </div>
          </template>

          <!-- Attached projects -->
          <template v-for="(files, name) in wb.projectFiles.value" :key="'p-' + name">
            <div class="fp-group-head">
              <span>Project · {{ name }}</span>
              <button class="fp-mini" title="Detach from this chat" @click="wb.detachProject(name)">
                <Icon icon="material-symbols:link-off-rounded" width="12" height="12" />
              </button>
            </div>
            <p v-if="!files.length" class="fp-hint">No files yet.</p>
            <template v-for="row in treeRows(files)" :key="name + '-' + row.entry.path">
              <div class="fp-row" :style="{ paddingLeft: 4 + row.depth * 12 + 'px' }"
                @click="onProjectRowClick(name, row)">
                <Icon :icon="iconFor(row)" width="15" height="15" class="fp-row-icon" :class="{ dim: row.dir }" />
                <span class="fp-name">{{ row.label }}</span>
                <span class="fp-size">{{ wb.formatBytes(row.entry.size) }}</span>
                <span v-if="!row.dir" class="fp-actions" @click.stop>
                  <button class="fp-mini" title="Download" @click="downloadProjectFile(name, row.entry.path)">
                    <Icon icon="material-symbols:download-rounded" width="13" height="13" />
                  </button>
                  <button class="fp-mini" title="Rename" @click="doRenameProjectFile(name, row.entry.path)">
                    <Icon icon="material-symbols:drive-file-rename-outline-outline-rounded" width="13" height="13" />
                  </button>
                  <button class="fp-mini danger" title="Delete" @click="doDeleteProjectFile(name, row.entry.path)">
                    <Icon icon="material-symbols:delete-outline-rounded" width="13" height="13" />
                  </button>
                </span>
              </div>
            </template>
          </template>
          </template>
        </template>
      </div>

      <!-- Footer: projects disclosure + output budget (GLOBAL — works everywhere) -->
      <div class="dock-footer">
        <button type="button" class="proj-toggle" @click="showProjects = !showProjects"
          :aria-expanded="showProjects">
          <Icon :icon="showProjects ? 'material-symbols:keyboard-arrow-down-rounded' : 'material-symbols:chevron-right-rounded'"
            width="16" height="16" />
          <span>Projects</span>
          <span class="proj-count">{{ wb.library.value.length }}</span>
        </button>

        <div v-show="showProjects" class="proj-panel">
          <p v-if="!wb.library.value.length" class="fp-hint">
            No projects yet — create one to share files across chats.
          </p>
          <div v-for="proj in wb.library.value" :key="'lib-' + proj.name" class="fp-row lib"
            :class="{ staged: stagingMode && isStaged(proj.name) }">
            <Icon icon="material-symbols:bookmarks-outline-rounded" width="14" height="14" class="fp-row-icon" />
            <span class="fp-name" :title="proj.files + ' file(s) · ' + wb.formatBytes(proj.bytes)">
              {{ proj.name }}
            </span>
            <span class="fp-size">{{ proj.files }} · {{ wb.formatBytes(proj.bytes) }}</span>
            <span class="fp-actions always" @click.stop>
              <!-- Staging mode: same attach/detach buttons, aimed at the next chat -->
              <button v-if="stagingMode && isStaged(proj.name)" class="fp-mini"
                title="Staged for your next chat — click to remove" @click="pending.unstageProject(proj.name)">
                <Icon icon="material-symbols:link-off-rounded" width="13" height="13" />
              </button>
              <button v-else-if="stagingMode" class="fp-mini" title="Attach to your next chat"
                @click="pending.stageProject(proj.name)">
                <Icon icon="material-symbols:link-rounded" width="13" height="13" />
              </button>
              <!-- Live chat -->
              <button v-else-if="proj.attached && canAttach" class="fp-mini" title="Attached — click to detach"
                @click="wb.detachProject(proj.name)">
                <Icon icon="material-symbols:link-off-rounded" width="13" height="13" />
              </button>
              <button v-else-if="canAttach && !proj.attached" class="fp-mini" title="Attach to this chat"
                @click="wb.attachProject(proj.name)">
                <Icon icon="material-symbols:link-rounded" width="13" height="13" />
              </button>
              <button class="fp-mini danger" title="Delete project" @click="doDeleteProject(proj.name)">
                <Icon icon="material-symbols:delete-outline-rounded" width="13" height="13" />
              </button>
            </span>
          </div>
          <form class="fp-new-project" @submit.prevent="doCreateProject">
            <input v-model="newProjectName" class="fp-input" placeholder="New project…" aria-label="New project name" />
            <button type="submit" class="fp-mini" title="Create project">
              <Icon icon="material-symbols:add-rounded" width="16" height="16" />
            </button>
          </form>
          <button type="button" class="fp-manage" @click="router.push('/projects')">
            <Icon icon="material-symbols:grid-view-outline-rounded" width="13" height="13" />
            Open project manager
          </button>
        </div>

        <div class="tokens-row">
          <label for="pc-max-tokens" class="tokens-label">Max output tokens</label>
          <input id="pc-max-tokens" type="number" class="value-input" :min="256" :max="128000" :step="256"
            :value="maxTokens" @input="onMaxTokensInput" />
        </div>
      </div>

      <!-- Preview overlay -->
      <div v-if="wb.preview.value" class="pc-preview">
        <header class="pc-preview-head">
          <button class="action-btn" title="Back" aria-label="Back to workspace" @click="wb.closePreview()">
            <Icon icon="material-symbols:arrow-back-rounded" width="20" height="20" />
          </button>
          <span class="pc-preview-path">{{ wb.preview.value.displayPath }}</span>
          <span v-if="preparing" class="pc-chip preparing">Preparing…</span>
          <span v-else-if="previewWarn" class="pc-chip warned" :title="previewWarn">{{ previewWarn }}</span>

          <div v-if="hasRenderView" class="fp-seg" role="group" aria-label="View mode">
            <button type="button" :class="['seg-btn', { on: !codeView }]" @click="codeView = false">Preview</button>
            <button type="button" :class="['seg-btn', { on: codeView }]" @click="codeView = true">Code</button>
          </div>

          <button class="action-btn" :title="copied ? 'Copied' : 'Copy content'" aria-label="Copy content"
            @click="copyContent()">
            <Icon :icon="copied ? 'material-symbols:check-rounded' : 'material-symbols:content-copy-outline-rounded'"
              width="20" height="20" />
          </button>
          <a class="action-btn" title="Download" href="#" @click.prevent="wb.downloadFile(wb.preview.value.displayPath)">
            <Icon icon="material-symbols:download-rounded" width="20" height="20" />
          </a>
        </header>

        <!-- Rendered view (per-kind) -->
        <template v-if="!codeView">
          <!-- Sandboxed opaque origin: generated scripts cannot touch app storage.
               Errors inside the document are trapped and surfaced in the header. -->
          <div v-if="wb.preview.value.kind === 'html'" class="pc-preview-body pc-frame-wrap">
            <iframe v-if="previewSrc" class="pc-frame" sandbox="allow-scripts" referrerpolicy="no-referrer"
              :src="previewSrc" title="HTML preview" />
          </div>
          <div v-else-if="wb.preview.value.kind === 'md'" class="pc-preview-body markdown-content"
            v-html="renderedMd"></div>
          <pre v-else-if="wb.preview.value.kind === 'json'" class="pc-preview-body pc-code">{{ prettyJson }}</pre>
          <pre v-else class="pc-preview-body pc-code">{{ wb.preview.value.content }}</pre>
        </template>
        <!-- Source view -->
        <pre v-else class="pc-preview-body pc-code">{{ wb.preview.value.content }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import { md } from "~/utils/markdown";
import {
  inlineHtmlAssets,
  ensureBaseTag,
} from "~/utils/htmlPreview";
import DEFAULT_PARAMETERS from "@/composables/defaultParameters";
import { useGlobalIncognito } from "~/composables/useGlobalIncognito";
import { useWorkspaceBrowser } from "~/composables/useWorkspaceBrowser";
import { usePendingChatSetup } from "~/composables/pendingChatSetup";
import { confirmDialog, promptDialog } from "~/composables/useDialogs";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  settingsManager: { type: Object, required: true },
  sidebarOpen: { type: Boolean, default: false },
});
// resize → layout adjusts main-content margin via --dock-w;
// sidebar-close → layout collapses the nav so wide previews get focus.
const emit = defineEmits(["close", "save", "resize", "sidebar-close"]);

// ---------- dock sizing / sidebar coordination ----------
//
// The dock shares horizontal space with the chat AND, potentially, the main
// sidebar (280px). Rather than fixed widths, every dock width is clamped to
// a budget: viewport − sidebar − a minimum comfortable chat column. The
// chat minimum scales with screen size so both panels always fit.
const DOCK_W = 380;
const SIDEBAR_W = 280;
const DOCK_MIN_W = 300;

function chatMinWidth() {
  const w = window.innerWidth;
  if (w >= 1400) return 420; // roomy desktops keep a wide chat column
  if (w >= 1100) return 380; // laptops
  return 320; // small desktops / large tablets
}

function widthBudget() {
  const sidebar = props.sidebarOpen && !isMobile.value ? SIDEBAR_W : 0;
  return Math.max(DOCK_MIN_W, window.innerWidth - sidebar - chatMinWidth());
}

function wideWidth() {
  if (typeof window === "undefined") return 900;
  if (window.innerWidth <= 950) return window.innerWidth; // mobile overlay mode
  return Math.max(
    DOCK_MIN_W,
    Math.min(widthBudget(), Math.round(window.innerWidth * 0.62), 1000),
  );
}

function normalWidth() {
  if (typeof window === "undefined") return DOCK_W;
  if (window.innerWidth <= 950) return window.innerWidth;
  return Math.min(DOCK_W, widthBudget());
}

const { isIncognito } = useGlobalIncognito();
const wb = useWorkspaceBrowser();
const router = useRouter();

// ---------- mobile detection ----------
const isMobile = ref(false);
let resizeObserver;

function checkMobile() {
  isMobile.value = typeof window !== "undefined" && window.innerWidth <= 950;
  // Viewport changes resize the budget too.
  if (props.isOpen) syncDock();
}

onMounted(() => {
  if (typeof window !== "undefined") {
    checkMobile();
    resizeObserver = new ResizeObserver(checkMobile);
    resizeObserver.observe(document.body);
  }
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
});

// ---------- dock sizing / sidebar coordination ----------
function syncDock() {
  const w = !props.isOpen ? 0 : wb.preview.value ? wideWidth() : normalWidth();
  emit("resize", w);
}

// Reopening the main sidebar shrinks the dock instead of squeezing chat.
watch(
  () => props.sidebarOpen,
  () => {
    if (props.isOpen) syncDock();
  },
);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) {
      wb.closePreview();
    }
    syncDock();
    lockScroll(open && isMobile.value);
  },
);

watch(isMobile, () => lockScroll(props.isOpen && isMobile.value));

function lockScroll(lock) {
  if (typeof document === "undefined") return;
  document.documentElement.style.overflow = lock ? "hidden" : "";
}

function closePanel() {
  emit("close");
}
function saveSettings() {
  if (props.settingsManager) {
    props.settingsManager.saveSettings();
    emit("save");
  }
}

// ---------- max tokens ----------
const maxTokens = computed(() => {
  const cfg = props.settingsManager?.settings?.parameter_config;
  return cfg?.max_tokens ?? DEFAULT_PARAMETERS.max_tokens;
});

function onMaxTokensInput(e) {
  const value = parseInt(e.target.value, 10);
  if (!Number.isFinite(value)) return;
  const clamped = Math.max(256, Math.min(128000, value));
  const s = props.settingsManager.settings;
  if (!s.parameter_config || typeof s.parameter_config !== "object") {
    s.parameter_config = {};
  }
  s.parameter_config.max_tokens = clamped;
  saveSettings();
}

// ---------- files browser ----------
const showProjects = ref(false);
// Entering new-chat setup opens the Projects panel so the familiar
// attach buttons are immediately visible.
watch(
  () => wb.available.value,
  (avail) => {
    if (!avail && !isIncognito.value) showProjects.value = true;
  },
  { immediate: true },
);
const newProjectName = ref("");
const expandedDirs = ref(new Set());
const canAttach = computed(() => wb.available.value);

// ---------- layout: gallery (default) vs tree ----------
const VIEW_KEY = "workspace-dock-view";
const viewMode = ref("gallery");
const hasAnyFiles = computed(
  () => wb.chatFiles.value.length > 0 || Object.keys(wb.projectFiles.value ?? {}).length > 0,
);
const totalItems = computed(() => {
  const projects = Object.values(wb.projectFiles.value ?? {});
  return wb.chatFiles.value.length + projects.reduce((n, list) => n + list.length, 0);
});

function setViewMode(mode) {
  viewMode.value = mode;
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {}
}
if (typeof window !== "undefined") {
  try {
    if (localStorage.getItem(VIEW_KEY) === "tree") viewMode.value = "tree";
  } catch {}
}

// Gallery presents artifacts, not structure: flat, name-sorted cards.
function flatten(files) {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

function extOf(path) {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase().slice(0, 5) : "file";
}

// ---------- new-chat staging ----------
// With no chat open (and not incognito), the dock becomes a staging area:
// attached projects + uploaded files are applied to whatever conversation
// the user starts next. See composables/pendingChatSetup.js.
const pending = usePendingChatSetup();
const stageInputRef = ref(null);
const liveInputRef = ref(null);
const stagingMode = computed(() => !wb.available.value && !isIncognito.value);

function isStaged(name) {
  return pending.state.projects.includes(name);
}

function onStageUpload(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (files.length) pending.stageFiles(files);
}

function toggleDir(path) {
  const next = new Set(expandedDirs.value);
  next.has(path) ? next.delete(path) : next.add(path);
  expandedDirs.value = next;
}

function treeRows(files) {
  const byParent = new Map();
  const dirs = new Map();
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = f.path.split("/");
    let parent = "";
    for (let i = 0; i < segments.length - 1; i++) {
      const dirPath = segments.slice(0, i + 1).join("/");
      if (!dirs.has(dirPath)) dirs.set(dirPath, { path: dirPath, size: 0 });
      parent = dirPath;
    }
    const list = byParent.get(parent) || [];
    list.push(f);
    byParent.set(parent, list);
  }
  for (const f of files) {
    const segments = f.path.split("/");
    for (let i = 1; i < segments.length; i++) {
      const dirPath = segments.slice(0, i).join("/");
      const d = dirs.get(dirPath);
      if (d) d.size += f.size || 0;
    }
  }

  const rows = [];
  function walk(parent, depth) {
    const children = [];
    for (const f of byParent.get(parent) || []) children.push({ entry: f, dir: false });
    for (const [dirPath, d] of dirs) {
      const underParent =
        parent === ""
          ? !dirPath.includes("/")
          : dirPath.startsWith(`${parent}/`) &&
            !dirPath.slice(parent.length + 1).includes("/");
      if (underParent && dirPath.split("/").length === depth + 1) {
        children.push({ entry: d, dir: true });
      }
    }
    children.sort((a, b) =>
      a.dir === b.dir ? a.entry.path.localeCompare(b.entry.path) : a.dir ? -1 : 1,
    );
    for (const child of children) {
      rows.push({
        entry: child.entry,
        dir: child.dir,
        depth,
        label: child.entry.path.split("/").pop(),
      });
      if (child.dir && expandedDirs.value.has(child.entry.path)) {
        walk(child.entry.path, depth + 1);
      }
    }
  }
  walk("", 0);
  return rows;
}

function onRowClick(row) {
  if (row.dir) toggleDir(row.entry.path);
  else wb.openPreview(row.entry.path);
}

function onProjectRowClick(projectName, row) {
  if (row.dir) toggleDir(row.entry.path);
  else wb.openPreview(`projects/${projectName}/${row.entry.path}`);
}

async function downloadProjectFile(projectName, filePath) {
  await wb.downloadFile(`projects/${projectName}/${filePath}`);
}

function iconFor(row) {
  if (row.dir) {
    return expandedDirs.value.has(row.entry.path)
      ? "material-symbols:folder-open-outline-rounded"
      : "material-symbols:folder-outline-rounded";
  }
  const ext = /\.([a-z0-9]+)$/i.exec(row.entry.path)?.[1]?.toLowerCase();
  if (["md", "markdown"].includes(ext)) return "material-symbols:description-outline-rounded";
  if (["html", "htm", "svg"].includes(ext)) return "material-symbols:html-outline-rounded";
  if (ext === "json") return "material-symbols:data-object-rounded";
  if (["js", "mjs", "ts"].includes(ext)) return "material-symbols:code-rounded";
  if (["csv", "tsv"].includes(ext)) return "material-symbols:table-outline-rounded";
  return "material-symbols:draft-outline-rounded";
}

async function doRename(displayPath) {
  const current = displayPath.split("/").pop();
  const name = await promptDialog({
    title: "Rename",
    message: displayPath,
    initial: current,
    placeholder: "New name",
    confirmLabel: "Rename",
  });
  if (!name || name === current) return;
  try {
    await wb.renameEntry(displayPath, name);
  } catch (e) {
    wb.error.value = e.message || String(e);
  }
}

async function doDelete(displayPath, opts = {}) {
  const ok = await confirmDialog({
    title: opts.title || "Delete file",
    message: opts.message || `Delete "${displayPath}"? This cannot be undone.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await wb.deleteEntry(displayPath);
  } catch (e) {
    wb.error.value = e.message || String(e);
  }
}

// Project files are shared across every chat attached to the project —
// same mechanics as chat files, stronger warning.
function projectDisplayPath(name, path) {
  return `projects/${name}/${path}`;
}

function doRenameProjectFile(name, path) {
  return doRename(projectDisplayPath(name, path));
}

function doDeleteProjectFile(name, path) {
  return doDelete(projectDisplayPath(name, path), {
    title: "Delete project file",
    message:
      `Delete "${path}" from shared project "${name}"? Every chat attached to this project will lose access to it.\n` +
      `This cannot be undone.`,
  });
}

async function doDeleteProject(name) {
  const ok = await confirmDialog({
    title: "Delete project",
    message:
      `Delete the ENTIRE project "${name}" and every file in it?\n` +
      `This cannot be undone.`,
    confirmLabel: "Delete project",
    danger: true,
  });
  if (!ok) return;
  await wb.detachProject(name).catch(() => {});
  try {
    const { getDefaultRoot } = await import("~/utils/workspace");
    const projectsDir = await (
      await getDefaultRoot()
    ).getDirectoryHandle("projects", { create: true });
    await projectsDir.removeEntry(name, { recursive: true });
  } catch (e) {
    wb.error.value = e.message || String(e);
  }
  wb.refresh();
}

async function doCreateProject() {
  if (!newProjectName.value.trim()) return;
  try {
    await wb.createProject(newProjectName.value);
    newProjectName.value = "";
  } catch (e) {
    wb.error.value = e.message || String(e);
  }
}

function onUpload(e) {  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length || !wb.available.value) return;
  // Live chats only: uploads land in the chat's /data folder. With no chat
  // open, the toolbar switches to staging instead (see onStageUpload).
  wb.uploadFiles(files, "data", null);
}

// ---------- preview rendering -------------------------------------------
//
// HTML documents are assembled (asset inlining → base tag → error trap),
// wrapped in a Blob, and loaded via iframe.src instead of srcdoc. Blob URLs
// dodge srcdoc-specific quirks entirely, and the injected error trap posts
// runtime errors back here so opaque-origin failures are never silent.

const previewSrc = ref("");
const preparing = ref(false);
const previewWarn = ref("");
let previewSeq = 0;
let activeBlobUrl = "";
let finalHtmlCache = "";

// Preview vs source toggle. Every file can be inspected as raw text;
// opening a different document always returns to the rendered view.
const codeView = ref(false);
// The switch only exists when a document renders differently from its
// source: HTML/SVG documents and Markdown. Text, code, and JSON show
// their source directly, so offering a toggle would be noise.
const hasRenderView = computed(() => {
  const k = wb.preview.value?.kind;
  return k === "html" || k === "md";
});

// Copy-to-clipboard with brief visual confirmation.
const copied = ref(false);
let copyTimer = null;

async function copyContent() {
  const p = wb.preview.value;
  if (!p || !p.content) return;
  try {
    await navigator.clipboard.writeText(p.content);
    copied.value = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied.value = false), 1600);
  } catch (err) {
    console.warn("[files-panel] copy failed:", err);
  }
}

/* Runs FIRST inside every previewed document; forwards errors to us. */
const ERROR_TRAP =
  "<script>(function(){function r(m){try{parent.postMessage({__pvErr:String(m).slice(0,200)},\"*\")}catch(e){}}" +
  'window.addEventListener("error",function(e){r((e.message||"Script error")+(e.filename?" ("+e.filename.split("/").pop()+":"+e.lineno+")":""))});' +
  'window.addEventListener("unhandledrejection",function(e){var x=e&&e.reason;r("Promise rejection: "+((x&&x.message)||String(x)))});})();<' +
  "/script>";

function releaseBlob() {
  if (activeBlobUrl) {
    try {
      URL.revokeObjectURL(activeBlobUrl);
    } catch {}
    activeBlobUrl = "";
  }
}

function setPreviewDoc(html) {
  finalHtmlCache = html;
  releaseBlob();
  const blob = new Blob([html], { type: "text/html" });
  activeBlobUrl = URL.createObjectURL(blob);
  previewSrc.value = activeBlobUrl;
}

function visibleTextLength(html) {
  const bodyIdx = html.indexOf("<body");
  const body = bodyIdx === -1 ? html : html.slice(bodyIdx);
  return body.replace(/<[^>]*>/g, "").trim().length;
}

watch(
  () => wb.preview.value,
  async (p) => {
    const seq = ++previewSeq;
    codeView.value = false;
    // Any preview (text, md, json, html) widens the dock and asks the
    // layout to collapse the main sidebar so chat + artifact get focus.
    if (p) emit("sidebar-close");
    syncDock();

    if (!p || p.kind !== "html") {
      releaseBlob();
      previewSrc.value = "";
      preparing.value = false;
      previewWarn.value = "";
      return;
    }

    preparing.value = true;
    previewWarn.value = "";
    let doc = "";
    try {
      doc = await inlineHtmlAssets(p.content, p.displayPath, (path) =>
        wb.readEntryText(path),
      );
    } catch (err) {
      console.warn("[files-panel] asset inlining failed:", err);
      doc = p.content;
    }
    if (seq !== previewSeq) return; // superseded by a newer preview

    setPreviewDoc(ensureBaseTag(doc) + ERROR_TRAP);
    preparing.value = false;

    // Empty-document heuristic: warn instead of showing a silent white void.
    // Checked against the pre-trap document (the trap itself adds a script).
    if (!/<(canvas|img|video|iframe|svg|script)\b/i.test(doc) &&
      visibleTextLength(doc) <= 40) {
      previewWarn.value = "Document looks empty — nothing to render.";
    }
  },
  { immediate: true },
);

// Surface runtime errors that happen INSIDE the sandboxed preview.
function onPreviewMessage(e) {
  const data = e.data;
  if (data && typeof data === "object" && data.__pvErr) {
    previewWarn.value = "⚠ " + String(data.__pvErr).slice(0, 140);
  }
}

onMounted(() => window.addEventListener("message", onPreviewMessage));
onUnmounted(() => {
  window.removeEventListener("message", onPreviewMessage);
  releaseBlob();
});

// ---------- previews: text flavors --------------------------------------

const renderedMd = computed(() => {
  const p = wb.preview.value;
  return p && p.kind === "md" ? md.render(p.content || "") : "";
});

const prettyJson = computed(() => {
  const p = wb.preview.value;
  if (!p || p.kind !== "json") return "";
  try {
    return JSON.stringify(JSON.parse(p.content), null, 2);
  } catch {
    return p.content;
  }
});
</script>

<style scoped>
.workspace-dock-wrapper {
  position: relative;
}

.workspace-dock-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  z-index: 1199;
  transition: opacity 0.3s cubic-bezier(.4, 1, .6, 1);
  pointer-events: none;
  user-select: none;
}
.workspace-dock-overlay.active {
  opacity: 1;
  pointer-events: auto;
}

.workspace-dock {
  position: fixed;
  right: 0;
  top: 0;
  height: 100dvh;
  width: var(--dock-w, 380px);
  min-width: 300px;
  max-width: 92vw;
  background: var(--panel-bg);
  color: var(--text-primary);
  border-left: 1px solid var(--border);
  transform: translateX(100%);
  transition:
    transform 0.3s cubic-bezier(.4, 1, .6, 1),
    width 0.25s cubic-bezier(.4, 1, .6, 1);
  display: flex;
  flex-direction: column;
  z-index: 1200; /* above TopBar (1001) */
}
.workspace-dock.active {
  transform: translateX(0);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 16px;
  flex-shrink: 0;
}
.panel-title {
  font-size: 1.05em;
  font-weight: 600;
}
.header-actions { display: flex; gap: 8px; }
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}
.action-btn:hover { background: var(--btn-hover); color: var(--text-primary); }

.panel-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 14px 10px;
}

.fp-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0 8px;
  flex-wrap: wrap;
}
.fp-toolbar-note {
  font-size: 0.68rem;
  color: var(--text-secondary);
  margin-right: auto;
}
.fp-tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}
.fp-tool:hover { background: var(--btn-hover); }
.fp-tool:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---------- upload-target popover ---------- */

.fp-pop-wrap {
  position: relative;
}
.fp-trigger { max-width: 170px; }
.fp-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 122px;
}
.fp-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 210px;
  max-width: min(280px, calc(100vw - 32px));
  max-height: 300px;
  overflow-y: auto;
  padding: 5px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-xl);
  z-index: 30;
}
.fp-pop .fp-hint { padding: 6px 8px; margin: 0; }
.fp-pop-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  text-align: left;
}
.fp-pop-item:hover { background: var(--btn-hover); }
.fp-pop-slot {
  width: 16px;
  flex-shrink: 0;
  display: inline-flex;
  justify-content: center;
}
.fp-pop-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-pop-meta {
  flex-shrink: 0;
  font-size: 0.64rem;
  color: var(--text-secondary);
}

.fp-error { padding: 4px 0; color: #dc2626; font-size: 0.72rem; }
.fp-hint { color: var(--text-secondary); font-size: 0.74rem; padding: 2px 0 6px; }
.fp-empty { color: var(--text-secondary); font-size: 0.8rem; padding: 12px 2px; }

.fp-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 10px 0 4px;
}

.fp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
  min-height: 24px;
}
.fp-row:hover { background: var(--btn-hover); }
.fp-row.lib { cursor: default; }
.fp-row-icon { flex-shrink: 0; opacity: 0.9; }
.fp-row-icon.dim { opacity: 0.6; }

.fp-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
}
.fp-size {
  flex-shrink: 0;
  font-size: 0.64rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.fp-actions { display: none; align-items: center; gap: 2px; }
.fp-actions.always { display: inline-flex; }
.fp-row:hover .fp-actions { display: inline-flex; }

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
.fp-mini:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---------- gallery / tree toggle ---------- */

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
  /* Concentric by construction: track radius 8 − 2px padding = 6. */
  border-radius: 6px;
}
.seg-btn:hover { color: var(--text-primary); }
.seg-btn.on { background: var(--btn-hover); color: var(--text-primary); }

/* ---------- gallery cards ---------- */

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
  padding: 2px 0 10px;
}

.ws-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ws-card:hover {
  background: var(--btn-hover);
  border-color: var(--border);
}
.ws-icon { opacity: 0.85; flex-shrink: 0; }
.ws-name {
  font-size: 0.74rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ws-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
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
  font-variant-numeric: tabular-nums;
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
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px;
}
.ws-card:hover .ws-actions { display: inline-flex; }

/* ---------- footer ---------- */

.dock-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  padding: 6px 14px 12px;
  background: var(--panel-bg);
}

.proj-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 6px;
}
.proj-toggle:hover { color: var(--text-primary); background: var(--btn-hover); }
.proj-count {
  background: var(--bg-secondary, rgba(128,128,128,.15));
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 0.64rem;
}

.proj-panel {
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}

.fp-new-project { display: flex; gap: 6px; padding: 6px 0 2px; }
.fp-manage {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.72rem;
  cursor: pointer;
  border-radius: 6px;
}
.fp-manage:hover { color: var(--text-primary); background: var(--btn-hover); }
.fp-input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--panel-input-bg);
  color: var(--text-primary);
  font-size: 0.75rem;
}

.tokens-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
}
.tokens-label { font-size: 0.74rem; color: var(--text-secondary); }
.value-input {
  width: 84px;
  padding: 5px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-input-bg);
  color: var(--text-primary);
  text-align: center;
  font-size: 0.82rem;
}
.value-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--focus-ring);
}

/* ---------- preview overlay ---------- */

.pc-preview {
  position: absolute;
  inset: 0;
  background: var(--panel-bg);
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.pc-preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  min-height: 52px;
  box-sizing: border-box;
}
.pc-preview-path {
  flex: 1;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-chip {
  font-size: 0.68rem;
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 55%;
}
.pc-chip.preparing {
  color: var(--text-secondary);
  animation: pc-fade 1.1s ease-in-out infinite;
}
.pc-chip.warned {
  color: #d97706;
  background: rgba(217, 119, 6, 0.12);
  cursor: help;
}
@keyframes pc-fade { 50% { opacity: 0.35; } }

.pc-preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
  margin: 0;
}
.pc-code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.pc-frame-wrap { padding: 0; display: flex; }
.pc-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

@media (max-width: 950px) {
  .workspace-dock-overlay.active { background: rgba(0, 0, 0, 0.55); }
  .workspace-dock,
  .workspace-dock.wide {
    width: 100vw;
    max-width: 100vw;
  }
}
</style>

