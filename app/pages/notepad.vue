<template>
  <div class="notepad-page">
    <div class="notepad-column">
      <div class="notepad-header">
        <div class="notepad-title-row">
          <button class="np-back" aria-label="Back to settings" title="Back to settings" @click="goBackToSettings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1>My Notepad</h1>
          <span v-if="notepad?.metadata" class="last-updated">
            Last updated: {{ formatDate(notepad.metadata.lastUpdated) }}
          </span>
        </div>
        <div class="notepad-actions">
          <UiButton
            variant="secondary"
            icon="material-symbols:refresh-rounded"
            :loading="isRefreshing"
            @click="refreshNotepad"
          >
            Refresh
          </UiButton>
          <UiButton
            variant="secondary"
            icon="material-symbols:download"
            :disabled="!notepad?.content"
            @click="exportNotepad"
          >
            Export
          </UiButton>
          <UiButton
            variant="danger"
            icon="material-symbols:delete-outline-rounded"
            :loading="isResetting"
            @click="handleResetNotepad"
          >
            Reset
          </UiButton>
        </div>
      </div>

      <div ref="contentRef" class="notepad-content">
        <div v-if="isLoading" class="loading-state">
          <UiSpinner :size="28" :stroke="3" label="Loading your Notepad" />
          <p>Loading your Notepad…</p>
        </div>

        <UiEmptyState
          v-else-if="error"
          icon="material-symbols:error-outline"
          title="Couldn't load your Notepad"
          :description="error"
        >
          <UiButton variant="secondary" @click="loadNotepadData">Try Again</UiButton>
        </UiEmptyState>

        <div
          v-else-if="notepad?.content?.trim()"
          class="markdown-content notepad-markdown"
          v-html="renderedContent"
        ></div>

        <div v-else class="empty-state">
          <p>
            Your Notepad is empty. As you chat with the AI, your Notepad
            will be maintained automatically in the background.
          </p>
          <NuxtLink to="/settings" class="settings-link">Go to Settings</NuxtLink>
        </div>
      </div>

      <div v-if="pipelineStatus" class="pipeline-status">
        <div class="status-header">
          <h3>Maintenance</h3>
          <span :class="['status-badge', pipelineStatus.status]">
            {{ pipelineStatus.status }}
          </span>
        </div>
        <p v-if="pipelineStatus.lastRun" class="status-detail">
          Last run: {{ formatDate(pipelineStatus.lastRun) }}
        </p>
        <p v-if="pipelineStatus.lastError" class="status-error">
          {{ pipelineStatus.lastError }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { loadNotepad, exportNotepadAsDownload, resetNotepad } from '~/composables/notepad';
import {
  getNotepadPipelineStatus,
  runNotepadPipeline,
  isNotepadPipelineRunning,
  notepadEvents,
} from '~/composables/notepadPipeline';
import { clearAllSummaries } from '~/composables/chatSummarizer';
import { confirmDialog } from '~/composables/useDialogs';
import { useSettings } from '~/composables/useSettings';
import { md } from '~/utils/markdown';
import { highlightAllBlocks } from '~/utils/lazyHighlight';

const notepad = ref(null);
const isLoading = ref(true);
const isRefreshing = ref(false);
const isResetting = ref(false);
const error = ref(null);
const pipelineStatus = ref(null);
const contentRef = ref(null);

const settingsManager = useSettings();
const router = useRouter();

// Mobile entry point: the Notepad lives under Settings → Memory.
function goBackToSettings() {
  router.push({ path: '/settings', query: { tab: 'memory' } });
}

/**
 * Render the notepad content using the shared markdown renderer.
 * The notepad content is pure markdown (no frontmatter), so we don't
 * need to strip anything here.
 */
const renderedContent = computed(() => {
  const content = notepad.value?.content;
  if (!content || !content.trim()) return '';
  return md.render(content);
});

// Re-run syntax highlighting whenever the rendered content changes.
// We scope the call to the notepad content container rather than the
// whole document, to avoid re-highlighting code blocks elsewhere on the
// page.
watch(renderedContent, () => {
  nextTick(() => {
    if (contentRef.value) {
      highlightAllBlocks(contentRef.value);
    }
  });
});

function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadNotepadData() {
  isLoading.value = true;
  error.value = null;

  try {
    notepad.value = await loadNotepad();
    pipelineStatus.value = await getNotepadPipelineStatus();
  } catch (err) {
    error.value = 'Failed to load Notepad: ' + err.message;
    console.error('Error loading Notepad:', err);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Refreshes the notepad by triggering a pipeline run. We DO NOT call
 * `forceRunNotepadPipeline` here — that resets state and clobbers
 * any in-flight work. If the pipeline is already running, we just
 * wait for it to finish and reload.
 */
async function refreshNotepad() {
  // Wait until settings are loaded before we can resolve the selected model.
  if (!settingsManager.isLoaded) {
    error.value = 'Settings are still loading. Try again in a moment.';
    return;
  }

  if (!settingsManager.selectedModel) {
    error.value = 'Select a model first — the Notepad runs on your currently selected model.';
    return;
  }

  isRefreshing.value = true;
  error.value = null;

  try {
    if (await isNotepadPipelineRunning()) {
      // Don't double-trigger; just wait for the existing run to finish.
      error.value = 'A Notepad update is already running. Please wait…';
      return;
    }

    const result = await runNotepadPipeline();
    if (result?.success) {
      await loadNotepadData();
    } else {
      error.value = result?.error || 'Failed to refresh Notepad';
    }
  } catch (err) {
    error.value = 'Error refreshing Notepad: ' + err.message;
    console.error('Error refreshing notepad:', err);
  } finally {
    isRefreshing.value = false;
  }
}

function exportNotepad() {
  if (!notepad.value?.content) return;
  const { url, revoke } = exportNotepadAsDownload(notepad.value);

  const link = document.createElement('a');
  link.href = url;
  link.download = `notepad-${new Date().toISOString().split('T')[0]}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Release the Blob URL once the browser has had a chance to start
  // the download. A small timeout is enough for the download to
  // dispatch in all major browsers.
  setTimeout(revoke, 1000);
}

async function handleResetNotepad() {
  const ok = await confirmDialog({
    title: "Reset your Notepad?",
    message:
      "This will delete all of your current notes and clear the existing " +
      "chat summaries so they can be regenerated from scratch on the next " +
      "maintenance pass. Your conversation history is not affected.\n\n" +
      "This cannot be undone.",
    confirmLabel: "Reset Notepad",
    danger: true,
  });
  if (!ok) return;

  isResetting.value = true;
  error.value = null;

  try {
    await clearAllSummaries();
    await resetNotepad();
    await loadNotepadData();
  } catch (err) {
    error.value = 'Failed to reset Notepad: ' + err.message;
    console.error('Error resetting notepad:', err);
  } finally {
    isResetting.value = false;
  }
}

// Reflect live pipeline status changes into the status panel.
const handleStatusEvent = (payload) => {
  pipelineStatus.value = {
    ...(pipelineStatus.value || {}),
    status: payload.status,
    stage: payload.stage,
    lastError: payload.lastError ?? null,
  };
};

onMounted(() => {
  loadNotepadData();
  notepadEvents.on('status', handleStatusEvent);
});

onBeforeUnmount(() => {
  notepadEvents.off('status', handleStatusEvent);
});
</script>

<style scoped>
/*
  Layout:
    .notepad-page     -> outer section, fills the layout's .main-container
                          (matches the pattern used by index.vue / [id].vue /
                          incognito.vue's .chat-section)
    .notepad-column   -> inner column, centered with max-width 800px,
                          holds the header, content card, and pipeline status
    .notepad-content  -> the scrolling content card (internal overflow-y: auto)
*/
.notepad-page {
  display: flex;
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: var(--spacing-24);
  overflow: hidden;
  box-sizing: border-box;
}

.notepad-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  min-width: 0;
  overflow: hidden;
}

.notepad-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-12);
  margin-bottom: var(--spacing-16);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.notepad-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-12);
  flex-wrap: wrap;
  min-width: 0;
}

/* Mobile-only escape hatch back to Settings → Memory. Hidden on desktop,
   where the sidebar/settings navigation is one click away anyway. */
.np-back {
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  align-self: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}
.np-back:hover { background: var(--btn-hover); color: var(--text-primary); }
@media (max-width: 950px) {
  .np-back { display: inline-flex; }
}

.notepad-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notepad-actions {
  display: flex;
  gap: var(--spacing-8);
  align-items: center;
  flex-wrap: wrap;
}

.last-updated {
  color: var(--text-secondary);
  font-size: 0.8125rem;
}

.notepad-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  padding: var(--spacing-24);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--spacing-16);
  color: var(--text-secondary);
}

.notepad-markdown {
  line-height: 1.6;
  color: var(--text-primary);
  min-width: 0;
  overflow-wrap: break-word;
  word-break: break-word;
}

.notepad-markdown :deep(table) {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
}

.notepad-markdown :deep(h1),
.notepad-markdown :deep(h2),
.notepad-markdown :deep(h3) {
  margin-top: 0 !important;
}

.notepad-markdown :deep(h1) {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: var(--spacing-16);
  padding-bottom: var(--spacing-12);
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.notepad-markdown :deep(h2) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: var(--spacing-24) !important;
  margin-bottom: var(--spacing-12);
  color: var(--text-primary);
}

.notepad-markdown :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: var(--spacing-16) !important;
  margin-bottom: var(--spacing-8);
  color: var(--text-primary);
}

.notepad-markdown :deep(p) {
  margin: 0 0 var(--spacing-12) 0 !important;
  color: var(--text-primary);
}

.notepad-markdown :deep(ul),
.notepad-markdown :deep(ol) {
  margin: 0 0 var(--spacing-12) 0 !important;
  padding-left: var(--spacing-24);
}

.notepad-markdown :deep(li) {
  margin-bottom: var(--spacing-4);
}

.notepad-markdown :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.notepad-markdown :deep(pre) {
  background: var(--bg-tertiary);
  padding: var(--spacing-12);
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 0 0 var(--spacing-12) 0 !important;
}

.notepad-markdown :deep(pre code) {
  background: none;
  padding: 0;
}

.notepad-markdown :deep(blockquote) {
  border-left: 3px solid var(--border);
  padding-left: var(--spacing-12);
  margin: 0 0 var(--spacing-12) 0 !important;
  color: var(--text-secondary);
  font-style: italic;
}

.pipeline-status {
  margin-top: var(--spacing-16);
  padding: var(--spacing-12) var(--spacing-16);
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-4);
}

.status-header h3 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.status-badge {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-badge.idle {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.status-badge.running {
  background: var(--info);
  color: var(--primary-foreground);
}

.status-badge.completed {
  background: var(--success);
  color: var(--primary-foreground);
}

.status-badge.failed {
  background: var(--danger);
  color: var(--primary-foreground);
}

.status-detail {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0;
}

.status-error {
  font-size: 0.8125rem;
  color: var(--danger);
  margin: var(--spacing-4) 0 0 0;
}

.settings-link {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}

.settings-link:hover {
  text-decoration: underline;
}

/* =========================================================
   Mobile / responsive styles
   - < 768px : tablet/mobile — reduce padding, hide button text
     labels (icon-only), wrap header, smaller title.
   - < 480px : small phone — hide "Last updated" header text
     (info is duplicated in pipeline status) and tighten
     padding further.
   ========================================================= */
@media (max-width: 768px) {
  .notepad-page {
    padding: var(--spacing-12);
  }

  .notepad-header {
    gap: var(--spacing-8);
  }

  .notepad-header h1 {
    font-size: 1.25rem;
  }

  .notepad-content {
    padding: var(--spacing-16);
  }

  .notepad-markdown :deep(h1) {
    font-size: 1.5rem;
  }

  .notepad-markdown :deep(h2) {
    font-size: 1.15rem;
  }

  .notepad-markdown :deep(h3) {
    font-size: 1rem;
  }

  .pipeline-status {
    margin-top: var(--spacing-12);
    padding: var(--spacing-8) var(--spacing-12);
  }
}

@media (max-width: 480px) {
  .notepad-page {
    padding: var(--spacing-8);
  }

  .notepad-header {
    margin-bottom: var(--spacing-12);
  }

  .last-updated {
    display: none;
  }

  .notepad-content {
    padding: var(--spacing-12);
    border-radius: var(--radius-md);
  }

  .notepad-markdown :deep(h1) {
    font-size: 1.35rem;
  }
}
</style>
