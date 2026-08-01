<script setup>
import { onMounted, ref, watch, computed } from "vue";
import { navigateTo } from "#app";
import { useSettings } from "@/composables/useSettings";
import { useDark, useToggle } from "@vueuse/core";
import { Icon } from "@iconify/vue";
import { loadNotepad } from "@/composables/notepad";
import {
  DEFAULT_COMPRESSION_MODEL,
  DEFAULT_THRESHOLD_TOKENS,
  DEFAULT_KEEP_RECENT_TOKENS,
} from "@/composables/contextCompressor";
import ExportMenu from "@/components/ExportMenu.vue";
import ImportMenu from "@/components/ImportMenu.vue";
import { groupShortcuts } from "@/composables/keyboardShortcuts";

// Define props and emits
const props = defineProps(["isOpen", "initialTab"]);
const emit = defineEmits(["reloadSettings", "close"]);

// --- Reactive State Variables ---
const settingsManager = useSettings();
const currTab = ref("general");
const isDark = useDark();
const toggleDark = useToggle(isDark);
const notepadEnabled = ref(false);
const gptOssLimitTables = ref(false);
const notepadMetadata = ref(null);

// Reference list for the Keyboard Shortcuts tab, derived from the registry.
const shortcutGroups = groupShortcuts();

// Context compression settings
const contextCompressionEnabled = ref(true);
const contextCompressionModel = ref(DEFAULT_COMPRESSION_MODEL);
const contextCompressionThresholdTokens = ref(DEFAULT_THRESHOLD_TOKENS);
const contextCompressionKeepRecentTokens = ref(DEFAULT_KEEP_RECENT_TOKENS);

// Data menu toggles
const isExportMenuOpen = ref(false);
const isImportMenuOpen = ref(false);

// User profile fields
const userName = ref("");
const occupation = ref("");
const customInstructions = ref("");

// API key fields
const customApiKey = ref("");
const showApiKey = ref(false);

// --- Constants for Navigation ---
const navItems = [
  {
    key: "general",
    label: "General",
    icon: "material-symbols:settings"
  },
  {
    key: "customization",
    label: "Customization",
    icon: "material-symbols:palette"
  },
  {
    key: "notepad",
    label: "Notepad",
    icon: "material-symbols:book"
  },
  {
    key: "contextCompression",
    label: "Auto Context Compression",
    icon: "material-symbols:compress"
  },
  {
    key: "data",
    label: "Data",
    icon: "material-symbols:database"
  },
  {
    key: "keybinds",
    label: "Keybinds",
    icon: "material-symbols:keyboard"
  },
  {
    key: "about",
    label: "About",
    icon: "material-symbols:info"
  }
];

// --- Lifecycle Hooks ---
onMounted(async () => {
  // Settings are loaded by the shared Settings instance; just wait
  // until they're available before reading them.
  if (!settingsManager.isLoaded) {
    await settingsManager.loadSettings();
  }
  userName.value = settingsManager.settings.user_name || "";
  occupation.value = settingsManager.settings.occupation || "";
  customInstructions.value = settingsManager.settings.custom_instructions || "";
  notepadEnabled.value = settingsManager.settings.notepad_enabled === true;
  gptOssLimitTables.value = settingsManager.settings.gpt_oss_limit_tables === true;
  customApiKey.value = settingsManager.settings.custom_api_key || "";

  // Load context compression settings
  contextCompressionEnabled.value = settingsManager.settings.context_compression_enabled !== false;
  contextCompressionModel.value = settingsManager.settings.context_compression_model || DEFAULT_COMPRESSION_MODEL;
  contextCompressionThresholdTokens.value = Number(settingsManager.settings.context_compression_threshold_tokens) || DEFAULT_THRESHOLD_TOKENS;
  contextCompressionKeepRecentTokens.value = Number(settingsManager.settings.context_compression_keep_recent_tokens) || DEFAULT_KEEP_RECENT_TOKENS;

  // Load notepad metadata
  await loadNotepadData();
});

// The dialog unmounts this panel when it closes, so on the next open the
// component mounts with `isOpen` already true. A non-immediate watcher would
// never fire and every deep link into a specific tab would land on General.
watch(
  () => [props.isOpen, props.initialTab],
  ([isOpen, initialTab]) => {
    if (isOpen) {
      currTab.value = initialTab || "general";
    }
  },
  { immediate: true }
);

watch(notepadEnabled, (newVal) => {
  console.log("[notepad] notepadEnabled changed to:", newVal);
});

// --- Functions ---
async function loadNotepadData() {
  const notepad = await loadNotepad();
  notepadMetadata.value = notepad.metadata;
}

function closeSettings() {
  emit("close");
}

function toggleNotepad(val) {
  notepadEnabled.value = val;
}

async function saveSettings() {
  // Save settings logic
  settingsManager.setSetting("user_name", userName.value);
  settingsManager.setSetting("occupation", occupation.value);
  settingsManager.setSetting("custom_instructions", customInstructions.value);
  settingsManager.setSetting("notepad_enabled", notepadEnabled.value);
  settingsManager.setSetting("gpt_oss_limit_tables", gptOssLimitTables.value);
  settingsManager.setSetting("custom_api_key", customApiKey.value.trim());

  // Save context compression settings
  settingsManager.setSetting("context_compression_enabled", contextCompressionEnabled.value);
  settingsManager.setSetting("context_compression_model", contextCompressionModel.value.trim());
  settingsManager.setSetting("context_compression_threshold_tokens", Math.max(4000, Number(contextCompressionThresholdTokens.value) || DEFAULT_THRESHOLD_TOKENS));
  settingsManager.setSetting("context_compression_keep_recent_tokens", Math.max(1000, Number(contextCompressionKeepRecentTokens.value) || DEFAULT_KEEP_RECENT_TOKENS));

  // Save settings and wait for completion before reloading
  await settingsManager.saveSettings();

  // Reload notepad data after saving settings
  await loadNotepadData();

  // Close settings and refresh the page
  closeSettings();

  // Small delay to ensure all async operations complete before reload
  setTimeout(() => {
    location.reload();
  }, 100);
}

function openNotepad() {
  closeSettings();
  navigateTo('/notepad');
}
</script>

<template>
  <div class="settings-panel" v-if="isOpen">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-content">
          <h1 class="panel-title">Settings</h1>
        </div>
        <UiIconButton icon="material-symbols:close" label="Close settings" @click="closeSettings" />
      </div>

      <div class="panel-content-wrapper">
        <!-- Vertical Navigation -->
        <div class="settings-nav">
          <div class="nav-items">
            <div v-for="item in navItems" :key="item.key" class="nav-item">
              <button class="nav-link" :class="{ active: currTab === item.key }" @click="currTab = item.key">
                <Icon :icon="item.icon" width="24" height="24" />
                <span class="nav-label">{{ item.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Content Area -->
        <div class="panel-content">
          <!-- General Tab -->
          <div v-show="currTab === 'general'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>General Settings</h2>
                <p>Basic configuration options</p>
              </div>
              <div class="setting-item">
                <div class="setting-info">
                  <h3>Dark Mode</h3>
                  <p>Toggle between light and dark themes</p>
                </div>
                <UiSwitch :model-value="isDark" aria-label="Dark mode" @update:model-value="toggleDark()" />
              </div>
              <div class="setting-item">
                <div class="setting-info">
                  <h3>Limit Tables for GPT-OSS</h3>
                  <p>When using GPT-OSS models (20B or 120B), limit table usage as much as possible</p>
                </div>
                <UiSwitch
                  :model-value="gptOssLimitTables"
                  aria-label="Limit tables for GPT-OSS"
                  @update:model-value="gptOssLimitTables = $event"
                />
              </div>
              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>API Key</h3>
                  <p>Enter your own API key to use models</p>
                </div>
                <div class="input-container api-key-container">
                  <input 
                    v-model="customApiKey" 
                    :type="showApiKey ? 'text' : 'password'" 
                    placeholder="Enter your API key"
                    class="custom-input api-key-input" 
                  />
                  <UiIconButton
                    class="toggle-visibility-btn"
                    size="sm"
                    :icon="showApiKey ? 'material-symbols:visibility-off' : 'material-symbols:visibility'"
                    :label="showApiKey ? 'Hide API key' : 'Show API key'"
                    @click="showApiKey = !showApiKey"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Customization Tab -->
          <div v-show="currTab === 'customization'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Customization</h2>
                <p>Personalize your experience</p>
              </div>

              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>What should Kira call you?</h3>
                  <p>Enter your name</p>
                </div>
                <div class="input-container">
                  <input v-model="userName" type="text" placeholder="Enter your name" class="custom-input" />
                </div>
              </div>

              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>What occupation do you have?</h3>
                  <p>Teacher, software engineer, student, etc.</p>
                </div>
                <div class="input-container">
                  <input v-model="occupation" type="text" placeholder="Teacher, software engineer, student, etc."
                    class="custom-input" />
                </div>
              </div>

              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>What custom instructions do you want Kira to follow?</h3>
                  <p>Be precise, be witty, etc.</p>
                </div>
                <div class="input-container">
                  <textarea v-model="customInstructions" placeholder="Be precise, be witty, etc."
                    class="custom-textarea" rows="3"></textarea>
                </div>
              </div>
            </div>
          </div>

          <!-- Notepad Tab -->
          <div v-show="currTab === 'notepad'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Notepad (Preview)</h2>
                <p>
                  Your Notepad is a private document that Kira maintains about you. It contains
                  observations about your personality, communication style, ongoing projects, and
                  recent activity, all stored locally on your device. Kira uses it as working
                  memory to give you more relevant answers.
                </p>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <h3>Enable Notepad</h3>
                  <p>Let Kira maintain a private Notepad about you across conversations</p>
                </div>
                <UiSwitch
                  :model-value="notepadEnabled"
                  aria-label="Enable Notepad"
                  @update:model-value="toggleNotepad"
                />
              </div>

              <div v-if="notepadEnabled" class="notepad-actions-section">
                <div class="notepad-status" v-if="notepadMetadata">
                  <div class="status-item">
                    <span class="status-label">Last updated:</span>
                    <span class="status-value">{{ notepadMetadata.lastUpdated ? new Date(notepadMetadata.lastUpdated).toLocaleDateString() : 'Never' }}</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Updates:</span>
                    <span class="status-value">{{ notepadMetadata.updateCount || 0 }}</span>
                  </div>
                </div>

                <div class="notepad-buttons">
                  <UiButton variant="secondary" icon="material-symbols:book" @click="openNotepad">
                    View My Notepad
                  </UiButton>
                </div>

                <div class="notepad-info">
                  <p>
                    The Notepad is automatically updated in the background based on your
                    conversations. It typically updates once per day or when you have several
                    new conversations. Your Notepad is never sent anywhere except the model
                    that's maintaining it.
                  </p>
                </div>
              </div>

              <div v-else class="notepad-disabled-message">
                <p>The Notepad is currently disabled. Enable it to let Kira document your chats.</p>
              </div>
            </div>
          </div>

          <!-- Context Compression Tab -->
          <div v-show="currTab === 'contextCompression'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Auto Context Compression</h2>
                <p>
                  Long conversations can be compressed so the model keeps going without running
                  out of context: older messages are summarized, and only the summary is sent to
                  the API. The original messages always stay on your device, untouched.
                </p>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <h3>Auto Context Compression</h3>
                  <p>Automatically compress older context once a conversation grows past the threshold</p>
                </div>
                <UiSwitch
                  :model-value="contextCompressionEnabled"
                  aria-label="Auto context compression"
                  @update:model-value="contextCompressionEnabled = $event"
                />
              </div>

              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>Compression Model</h3>
                  <p>The cheap model used to summarize context (must be available through OpenRouter)</p>
                </div>
                <div class="input-container">
                  <input v-model="contextCompressionModel" type="text" placeholder="deepseek/deepseek-v4-flash"
                    class="custom-input" />
                </div>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <h3>Threshold (tokens)</h3>
                  <p>Estimated context size at which compression runs — and at which the manual compress button appears</p>
                </div>
                <div class="input-container number-input-container">
                  <input v-model.number="contextCompressionThresholdTokens" type="number" min="4000" step="1000"
                    class="custom-input number-input" />
                </div>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <h3>Keep Recent (tokens)</h3>
                  <p>How much of the most recent conversation always stays verbatim</p>
                </div>
                <div class="input-container number-input-container">
                  <input v-model.number="contextCompressionKeepRecentTokens" type="number" min="1000" step="500"
                    class="custom-input number-input" />
                </div>
              </div>

              <div class="compression-info">
                <p>
                  When a conversation grows past the threshold, auto compression summarizes the oldest
                  context in the background — you can keep chatting while it runs. Even with auto
                  compression off, a small compress button appears at the threshold so you can run it
                  manually. If you edit an old message, affected summaries are discarded and rebuilt
                  on the next run.
                </p>
              </div>
            </div>
          </div>

          <!-- Data Tab -->
          <div v-show="currTab === 'data'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Data</h2>
                <p>Back up or restore your conversations, notepad, and settings.</p>
              </div>

              <div class="setting-item data-row">
                <div class="setting-info">
                  <h3>Export your data</h3>
                  <p>Download a zip archive of your chats, notepad, and settings.</p>
                </div>
                <UiButton variant="secondary" icon="material-symbols:download" @click="isExportMenuOpen = true">
                  Export
                </UiButton>
              </div>

              <div class="setting-item data-row">
                <div class="setting-info">
                  <h3>Import data</h3>
                  <p>Restore from a Kira export or an OpenWebUI chat export.</p>
                </div>
                <UiButton variant="secondary" icon="material-symbols:upload" @click="isImportMenuOpen = true">
                  Import
                </UiButton>
              </div>
            </div>
          </div>

          <!-- Keybinds Tab -->
          <div v-show="currTab === 'keybinds'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Keyboard Shortcuts</h2>
                <p>Master Kira with these shortcuts</p>
              </div>

              <!--
                Rendered from the shortcut registry in
                composables/keyboardShortcuts.js, which is the same list the
                key handler binds — so this page can never document a
                shortcut that no longer works.
              -->
              <div v-for="group in shortcutGroups" :key="group.group" class="keybind-group">
                <h3>{{ group.group }}</h3>
                <div class="keybind-list">
                  <div v-for="shortcut in group.shortcuts" :key="shortcut.id" class="keybind-row">
                    <span class="keybind-desc">{{ shortcut.label }}</span>
                    <UiKbd :keys="shortcut.combo" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- About Tab -->
          <div v-show="currTab === 'about'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>About</h2>
                <p>Information about Kira</p>
              </div>
              <div class="info-section">
                <p>
                  Kira is a modern, Nuxt-powered interface designed for seamless AI interactions. 
                  Built with developers in mind, it offers a customizable experience that adapts to your needs.
                </p>
                <p>
                  Features include:
                </p>
                <ul>
                  <li>Real-time AI conversation interface</li>
                  <li>Customizable user preferences</li>
                  <li>Persistent memory management</li>
                  <li>Dark/light mode support</li>
                  <li>Hack Club API integration</li>
                </ul>
                <p>
                  For more information, visit our 
                  <a href="https://github.com/DragonSenseiGuy/kira" target="_blank" rel="noopener noreferrer">Kira GitHub repository</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="panel-footer">
        <div class="footer-actions">
          <UiButton variant="ghost" size="lg" @click="closeSettings">Cancel</UiButton>
          <UiButton variant="primary" size="lg" @click="saveSettings">Save Changes</UiButton>
        </div>
      </div>
    </div>

  <ExportMenu :is-open="isExportMenuOpen" @close="isExportMenuOpen = false" />
  <ImportMenu :is-open="isImportMenuOpen" @close="isImportMenuOpen = false" @import-complete="$emit('reload-settings')" />
</template>

<style scoped>
.settings-panel {
  background: var(--bg-primary);
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}


/* Header */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
}

.header-content h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

/* Main Content Layout */
.panel-content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Vertical Navigation */
.settings-nav {
  width: 200px;
  border-right: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
  overflow-y: auto;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
}

.nav-item {
  width: 100%;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out);
  font-size: 0.875rem;
  font-weight: 500;
  width: 100%;
  text-align: left;
}

.nav-link:hover {
  background: var(--btn-hover-2);
  color: var(--text-primary);
}

.nav-link.active {
  background: var(--btn-hover-2);
  color: var(--primary);
}

.nav-label {
  flex: 1;
}

/* Content Area */
.panel-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-secondary);
}

.settings-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.content-header h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.content-header p {
  margin: 0 0 1.5rem;
  color: var(--text-secondary);
}

/* Settings row */
.setting-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  gap: 0.75rem;
}

.setting-item.textarea-item {
  flex-direction: column;
  align-items: stretch;
}

.setting-info h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-info p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.setting-item.textarea-item .setting-info {
  margin-bottom: 0.5rem;
}

.input-container {
  width: 100%;
  max-width: 400px;
}

.number-input-container {
  max-width: 120px;
}

.number-input {
  text-align: right;
}

/* Context Compression info box */
.compression-info {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.compression-info p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Data tab action buttons */
.data-row {
  align-items: center;
}

.setting-item.textarea-item .input-container {
  max-width: 400px;
}

.custom-input,
.custom-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;
}

.custom-input:focus,
.custom-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-a2);
}

/* API Key Input */
.api-key-container {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.api-key-input {
  flex: 1;
  font-family: monospace;
}

.clear-memory-container {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
}

.clear-memory-btn {
  padding: 0 1rem;
  background: var(--destructive);
  color: var(--destructive-foreground);
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out);
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-memory-btn:hover {
  background: var(--destructive-600);
}

/* Memory Facts List */
.memory-facts-section {
  margin-top: 1.5rem;
}

.memory-facts-section h3 {
  margin: 0 0 1rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.memory-facts-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.memory-fact-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out);
}

.memory-fact-item:hover {
  border-color: var(--primary-300);
}

.memory-fact-text {
  flex: 1;
  font-size: 0.875rem;
  color: var(--text-primary);
  word-break: break-word;
  padding-right: 1rem;
}

.delete-memory-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out);
  flex-shrink: 0;
}

.delete-memory-btn:hover {
  background: var(--bg-tertiary);
  color: var(--destructive);
}

.no-memory-message,
.memory-disabled-message {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.no-memory-message p,
.memory-disabled-message p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Notepad Section Styles */
.notepad-intro {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.notepad-intro p {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.notepad-actions-section {
  margin-top: 1.5rem;
}

.notepad-status {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.status-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-value {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-primary);
}

.notepad-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.clear-notepad-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  height: 40px;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.clear-notepad-btn {
  background: var(--bg-primary);
  color: var(--destructive);
  border: 1px solid var(--destructive);
}

.clear-notepad-btn:hover {
  background: var(--destructive);
  color: var(--destructive-foreground);
}

.notepad-info {
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.notepad-info p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.notepad-disabled-message {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.notepad-disabled-message p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Footer */
.panel-footer {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* Keybinds Styling */
.keybind-group {
  margin-bottom: 2rem;
}

.keybind-group h3 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1rem;
  opacity: 0.8;
}

.keybind-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.keybind-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out);
}

.keybind-row:hover {
  border-color: var(--line-strong);
  background: var(--bg-primary);
}

.keybind-desc {
  font-size: 0.9375rem;
  color: var(--text-primary);
  font-weight: 450;
}

/* Responsive */
@media (max-width: 768px) {
  .settings-nav {
    width: 60px;
  }

  .nav-label {
    display: none;
  }

  /* Make nav buttons smaller and center the icon */
  .nav-link {
    width: 36px;
    /* Reduced width */
    height: 36px;
    /* Reduced height, keep it square */
    padding: 0.6rem;
    /* Adjusted padding */
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0.25rem auto;
    /* Center the button within the 60px nav item */
  }

  .settings-panel {
    max-width: 100vw;
    max-height: 100dvh;
  }

  .settings-content {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .input-container {
    max-width: 100%;
  }
}

/* Horizontal Navigation (for tall narrow screens) */
@media (max-aspect-ratio: 2/3) {
  .panel-content-wrapper {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow-y: hidden;
    overflow-x: auto;
  }

  .nav-items {
    flex-direction: row;
    padding: 0.25rem 0.5rem;
  }
}
</style>
