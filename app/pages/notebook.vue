<template>
  <div class="notebook-page">
    <div class="notebook-header">
      <h1>My Notebook</h1>
      <div class="notebook-actions">
        <span v-if="notebook?.metadata" class="last-updated">
          Last updated: {{ formatDate(notebook.metadata.lastUpdated) }}
        </span>
        <button class="action-btn" @click="refreshNotebook" :disabled="isLoading">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
          Refresh
        </button>
        <button class="action-btn export-btn" @click="exportNotebook">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
        <button class="action-btn danger-btn" @click="handleResetNotebook">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
          Reset
        </button>
      </div>
    </div>

    <div class="notebook-content">
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading your Notebook...</p>
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button @click="loadNotebookData">Try Again</button>
      </div>

      <div v-else-if="notebook?.content" class="markdown-content notebook-markdown" v-html="renderedContent"></div>

      <div v-else class="empty-state">
        <p>No Notebook found. Enable memory in settings to start building your Notebook.</p>
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
        Error: {{ pipelineStatus.lastError }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { loadNotebook, exportNotebookAsDataUrl } from '~/composables/notebook';
import { getPipelineStatus, forceRunPipeline } from '~/composables/notebookPipeline';
import { useSettings } from '~/composables/useSettings';

const notebook = ref(null);
const isLoading = ref(true);
const error = ref(null);
const pipelineStatus = ref(null);

const settingsManager = useSettings();

// Simple markdown to HTML converter
const renderedContent = computed(() => {
  if (!notebook.value?.content) return '';
  
  // Remove frontmatter (content between --- markers at the start)
  let content = notebook.value.content.replace(/^---[\s\S]*?---\s*/, '');
  
  let html = content
    // Escape HTML
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    // Lists
    .replace(/^\- (.*$)/gim, '<li>$1</li>');
    
  // Wrap consecutive li elements in ul
  html = html.replace(/(<li>.*?<\/li>\s*)+/gims, '<ul>$&</ul>');
  // Fix nested ul
  html = html.replace(/<\/ul><ul>/gim, '');
  // Convert remaining newlines to spaces (paragraphs are handled by heading spacing)
  html = html.replace(/\n+/gim, ' ');
  
  return html;
});

function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadNotebookData() {
  isLoading.value = true;
  error.value = null;
  
  try {
    notebook.value = await loadNotebook();
    pipelineStatus.value = await getPipelineStatus();
  } catch (err) {
    error.value = 'Failed to load Notebook: ' + err.message;
    console.error('Error loading Notebook:', err);
  } finally {
    isLoading.value = false;
  }
}

async function refreshNotebook() {
  isLoading.value = true;
  
  try {
    const apiKey = settingsManager.settings?.custom_api_key;
    if (apiKey) {
      const result = await forceRunPipeline(apiKey);
      if (result.success) {
        await loadNotebookData();
      } else {
        error.value = result.error || 'Failed to refresh Notebook';
      }
    } else {
      error.value = 'Please add an API key in settings to refresh the Notebook';
    }
  } catch (err) {
    error.value = 'Error refreshing Notebook: ' + err.message;
  } finally {
    isLoading.value = false;
  }
}

function exportNotebook() {
  if (!notebook.value) return;
  
  const dataUrl = exportNotebookAsDataUrl(notebook.value);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `notebook-${new Date().toISOString().split('T')[0]}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function handleResetNotebook() {
  if (!confirm("Are you sure you want to reset your Notebook?\n\nThis will delete all memories about you and reset the Notebook to its initial state. The AI will start learning about you from scratch.\n\nThis cannot be undone.")) {
    return;
  }
  
  isLoading.value = true;
  error.value = null;
  
  try {
    // Clear all chat summaries so they will be re-processed
    const { clearAllSummaries } = await import('~/composables/chatSummarizer');
    await clearAllSummaries();
    
    // Reset notebook to empty template
    const { saveNotebook } = await import('~/composables/notebook');
    const emptyTemplate = `---
version: 1
lastUpdated: ${new Date().toISOString().split('T')[0]}
updateCount: 0
---

# Notes on the User

## The Person I'm Talking To

I've just started getting to know this user. As we have more conversations, I'll develop a clearer picture of who they are, what they care about, and how they like to communicate.

## Recent Activity

No conversations recorded yet.

## Background Context

Still learning about the user's background and longer-term interests.
`;
    await saveNotebook(emptyTemplate, {
      version: 1,
      lastUpdated: new Date().toISOString(),
      updateCount: 0,
      lastConsolidatedAt: null
    });
    
    await loadNotebookData();
  } catch (err) {
    error.value = 'Failed to reset Notebook: ' + err.message;
    console.error('Error resetting notebook:', err);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadNotebookData();
});
</script>

<style scoped>
.notebook-page {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--spacing-24);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notebook-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-16);
  flex-shrink: 0;
}

.notebook-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
}

.notebook-actions {
  display: flex;
  gap: var(--spacing-8);
  align-items: center;
}

.last-updated {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin-right: var(--spacing-8);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  padding: var(--spacing-8) var(--spacing-12);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--btn-hover);
}

.action-btn.export-btn {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

.action-btn.export-btn:hover:not(:disabled) {
  background: var(--primary-600);
}

.action-btn.danger-btn {
  background: transparent;
  color: var(--danger);
  border-color: var(--danger);
}

.action-btn.danger-btn:hover:not(:disabled) {
  background: var(--danger);
  color: var(--primary-foreground);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notebook-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  padding: var(--spacing-24);
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--spacing-16);
  color: var(--text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Notebook-specific markdown styles - override global code-blocks.css */
.notebook-markdown {
  line-height: 1.6;
  color: var(--text-primary);
}

/* Override global .markdown-content h1,h2,h3 margins */
.notebook-markdown :deep(h1),
.notebook-markdown :deep(h2),
.notebook-markdown :deep(h3) {
  margin-top: 0 !important;
}

.notebook-markdown :deep(h1) {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: var(--spacing-16);
  padding-bottom: var(--spacing-12);
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.notebook-markdown :deep(h2) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: var(--spacing-24) !important;
  margin-bottom: var(--spacing-12);
  color: var(--text-primary);
}

.notebook-markdown :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: var(--spacing-16) !important;
  margin-bottom: var(--spacing-8);
  color: var(--text-primary);
}

/* Override global .markdown-content p margins */
.notebook-markdown :deep(p) {
  margin: 0 0 var(--spacing-12) 0 !important;
  color: var(--text-primary);
}

/* Override global .markdown-content ul/ol margins */
.notebook-markdown :deep(ul),
.notebook-markdown :deep(ol) {
  margin: 0 0 var(--spacing-12) 0 !important;
  padding-left: var(--spacing-24);
}

.notebook-markdown :deep(li) {
  margin-bottom: var(--spacing-4);
}

.notebook-markdown :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono, monospace);
  font-size: 0.9em;
}

.notebook-markdown :deep(pre) {
  background: var(--bg-tertiary);
  padding: var(--spacing-12);
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 0 0 var(--spacing-12) 0 !important;
}

.notebook-markdown :deep(pre code) {
  background: none;
  padding: 0;
}

.notebook-markdown :deep(blockquote) {
  border-left: 3px solid var(--primary);
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

/* Dark mode adjustments */
.dark .action-btn {
  background: var(--bg-secondary);
}

.dark .action-btn:hover:not(:disabled) {
  background: var(--btn-hover);
}
</style>
