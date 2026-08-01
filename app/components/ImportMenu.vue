<script setup>
import { ref, computed, watch } from "vue";
import { Icon } from "@iconify/vue";
import {
  importFromZipBuffer,
  parseImportArchive,
  readFileAsBuffer,
} from "~/composables/importExport";
import { useSettings } from "~/composables/useSettings";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "import-complete"]);

const settingsManager = useSettings();

const fileInput = ref(null);
const file = ref(null);
const fileName = ref("");
const archive = ref(null);
const parseError = ref("");
const importError = ref("");
const isImporting = ref(false);
const isDragging = ref(false);

const chatsMode = ref("append");
const notepadMode = ref("replace");
const settingsMode = ref("replace");

const hasChats = computed(() => !!archive.value?.chats?.length);
const hasNotepad = computed(() => !!archive.value?.notepad);
const hasSettings = computed(() => !!archive.value?.settings);

const canImport = computed(() => {
  return (
    file.value != null &&
    archive.value != null &&
    (hasChats.value || hasNotepad.value || hasSettings.value) &&
    (chatsMode.value !== "skip" || notepadMode.value !== "skip" || settingsMode.value !== "skip")
  );
});

const chatOptions = [
  { value: "skip", label: "Skip" },
  { value: "replace", label: "Replace" },
  { value: "append", label: "Append" },
];

const binaryOptions = [
  { value: "skip", label: "Skip" },
  { value: "replace", label: "Replace" },
];

function reset() {
  file.value = null;
  fileName.value = "";
  archive.value = null;
  parseError.value = "";
  importError.value = "";
  chatsMode.value = "append";
  notepadMode.value = "replace";
  settingsMode.value = "replace";
}

function close() {
  emit("close");
}

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) reset();
  }
);

async function handleFile(selectedFile) {
  if (!selectedFile) return;
  file.value = selectedFile;
  fileName.value = selectedFile.name;
  parseError.value = "";
  importError.value = "";
  archive.value = null;

  try {
    const buffer = await readFileAsBuffer(selectedFile);
    archive.value = parseImportArchive(new Uint8Array(buffer));
  } catch (error) {
    parseError.value = error.message || "Could not read this file.";
    console.error("[ImportMenu] Parse error:", error);
  }
}

function onFileChange(event) {
  handleFile(event.target.files?.[0]);
}

function onDrop(event) {
  event.preventDefault();
  isDragging.value = false;
  handleFile(event.dataTransfer.files?.[0]);
}

function onDragOver(event) {
  event.preventDefault();
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function onFileInputClick(event) {
  // Reset so selecting the same file re-triggers the change handler.
  event.target.value = "";
}

async function handleImport() {
  if (isImporting.value || !canImport.value) return;
  isImporting.value = true;
  importError.value = "";
  try {
    const buffer = await readFileAsBuffer(file.value);
    const result = await importFromZipBuffer(new Uint8Array(buffer), {
      chatsMode: chatsMode.value,
      notepadMode: notepadMode.value,
      settingsMode: settingsMode.value,
      settingsManager,
    });
    emit("import-complete", result);
    close();
  } catch (error) {
    console.error("[ImportMenu] Import failed:", error);
    // Kept in the dialog so the chosen merge modes survive a failed attempt.
    importError.value = "Import failed. See the console for details.";
  } finally {
    isImporting.value = false;
  }
}
</script>

<template>
  <UiDialog
    :open="isOpen"
    title="Import Data"
    description="Restore from a Kira export or an OpenWebUI chat export."
    @update:open="(value) => !value && close()"
  >
    <!-- The file input lives outside the button: a form control nested in a
         button is invalid, and the button already forwards the click. -->
    <input
      ref="fileInput"
      type="file"
      accept=".zip,.json"
      class="file-input"
      @change="onFileChange"
      @click="onFileInputClick"
    />

    <button
      type="button"
      class="drop-zone"
      :class="{ dragging: isDragging, hasFile: !!file }"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @click="fileInput.click()"
    >
      <Icon icon="material-symbols:upload-file" width="32" height="32" class="drop-icon" />
      <span class="drop-title">Drop a zip or JSON file here</span>
      <span class="drop-hint">or click to browse</span>
      <span v-if="fileName" class="file-name">Selected: {{ fileName }}</span>
    </button>

    <p v-if="parseError" class="error-text u-enter" role="alert">{{ parseError }}</p>

    <div v-if="archive" class="sections u-enter">
      <p class="sections-title">Choose how to merge each section:</p>

      <!-- Two or three choices each, so they read better as segments than as
           a menu you have to open to see the options. -->
      <div v-if="hasChats" class="section-row">
        <div class="section-info">
          <span class="section-label">Chats</span>
          <span class="section-hint">
            {{ archive.chats.length }} conversation{{ archive.chats.length === 1 ? '' : 's' }} found
          </span>
        </div>
        <UiSegmented v-model="chatsMode" :options="chatOptions" aria-label="Chats merge mode" />
      </div>

      <div v-if="hasNotepad" class="section-row">
        <div class="section-info">
          <span class="section-label">Notepad</span>
          <span class="section-hint">Memory document found</span>
        </div>
        <UiSegmented v-model="notepadMode" :options="binaryOptions" aria-label="Notepad merge mode" />
      </div>

      <div v-if="hasSettings" class="section-row">
        <div class="section-info">
          <span class="section-label">Settings</span>
          <span class="section-hint">Preferences found</span>
        </div>
        <UiSegmented v-model="settingsMode" :options="binaryOptions" aria-label="Settings merge mode" />
      </div>

      <p v-if="!hasChats && !hasNotepad && !hasSettings" class="empty-archive">
        No importable data found in this file.
      </p>
    </div>

    <p v-if="importError" class="error-text u-enter" role="alert">{{ importError }}</p>

    <template #footer>
      <UiButton variant="ghost" @click="close">Cancel</UiButton>
      <UiButton
        variant="primary"
        :disabled="!canImport"
        :loading="isImporting"
        @click="handleImport"
      >
        Import
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 28px 20px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-card);
  background: var(--inset);
  color: inherit;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: var(--accent);
  background: var(--overlay-accent);
}

.drop-zone.hasFile {
  border-style: solid;
  border-color: var(--accent);
}

.file-input {
  display: none;
}

.drop-icon {
  color: var(--text-muted);
  margin-bottom: 4px;
}

.drop-title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.drop-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.file-name {
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--primary);
  word-break: break-all;
}

.error-text {
  margin: 12px 0 0;
  padding: 8px 12px;
  font-size: 0.82rem;
  color: var(--error-text);
  background: var(--error-bg);
  box-shadow: 0 0 0 1px var(--error-border);
  border-radius: var(--radius-control);
}

.sections {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sections-title {
  margin: 0 0 2px;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  background: var(--inset);
  box-shadow: var(--shadow-hairline);
  border-radius: var(--radius-control);
}

.section-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.section-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.section-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.empty-archive {
  margin: 0;
  padding: 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-secondary);
  background: var(--inset);
  box-shadow: var(--shadow-hairline);
  border-radius: var(--radius-control);
}
</style>
