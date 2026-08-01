<script setup>
import { ref, computed } from "vue";
import {
  exportAllToZip,
  generateExportFilename,
  triggerDownload,
} from "~/composables/importExport";

defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close"]);

const includeChats = ref(true);
const includeNotepad = ref(true);
const includeSettings = ref(true);
const includeApiKey = ref(false);
const isExporting = ref(false);
const exportError = ref("");

const canExport = computed(() => {
  return includeChats.value || includeNotepad.value || includeSettings.value;
});

function close() {
  emit("close");
}

async function handleExport() {
  if (isExporting.value || !canExport.value) return;
  isExporting.value = true;
  exportError.value = "";
  try {
    const blob = await exportAllToZip({
      includeChats: includeChats.value,
      includeNotepad: includeNotepad.value,
      includeSettings: includeSettings.value,
      includeApiKey: includeApiKey.value,
    });
    const filename = generateExportFilename();
    triggerDownload(blob, filename);
    close();
  } catch (error) {
    console.error("[ExportMenu] Export failed:", error);
    // Reported in the dialog rather than an alert(), so the chosen options
    // stay on screen and the user can retry without re-picking them.
    exportError.value = "Export failed. See the console for details.";
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <UiDialog
    :open="isOpen"
    title="Export Data"
    description="Choose what to include in your export archive. Empty or default sections are omitted automatically."
    @update:open="(value) => !value && close()"
  >
    <div class="options-list">
      <UiOptionRow
        v-model="includeChats"
        label="Chats"
        hint="All conversations with branching, reasoning, and attachments."
      />
      <UiOptionRow
        v-model="includeNotepad"
        label="Notepad"
        hint="Your private memory document."
      />
      <UiOptionRow
        v-model="includeSettings"
        label="Settings"
        hint="Preferences, model settings, and parameters."
      />
      <UiOptionRow
        v-model="includeApiKey"
        class="sub-option"
        label="Include API key"
        hint="Export your custom API key with the settings."
        :disabled="!includeSettings"
      />
    </div>

    <p v-if="exportError" class="export-error u-enter" role="alert">{{ exportError }}</p>

    <template #footer>
      <UiButton variant="ghost" @click="close">Cancel</UiButton>
      <UiButton
        variant="primary"
        :disabled="!canExport"
        :loading="isExporting"
        @click="handleExport"
      >
        Export
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.options-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-option {
  margin-left: 16px;
}

.export-error {
  margin: 12px 0 0;
  padding: 8px 12px;
  font-size: 0.82rem;
  color: var(--error-text);
  background: var(--error-bg);
  box-shadow: 0 0 0 1px var(--error-border);
  border-radius: var(--radius-control);
}
</style>
