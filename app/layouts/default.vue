<template>
  <div class="app-container">
    <Suspense v-if="sidebarOpen !== null">
      <AppSidebar :curr-convo="route.params.id" :messages="[]" :is-open="sidebarOpen"
        @close-sidebar="sidebarOpen = false" @toggle-sidebar="toggleSidebar"
        :is-dark="isDark" @delete-conversation="handleDeleteConversation"
        @new-conversation="handleNewConversation"
        @reload-settings="settingsManager.loadSettings" @open-settings="openSettingsPanel('general')" />
      <!-- Opens to General tab -->
    </Suspense>
    <ParameterConfigPanel :is-open="parameterConfigPanelOpen" :settings-manager="settingsManager"
      @close="parameterConfigPanelOpen = false" @save="handleParameterConfigSave" />
    <!--
      Restructured layout:
      - app-container: Main flex container with sidebar
      - main-container: Full width/height container for chat content
      - NuxtPage: Takes full width with internal max-width constraint (contains page-specific content)
    -->
    <div class="main-container"
      :class="{ 'sidebar-open': sidebarOpen, 'parameter-config-open': parameterConfigPanelOpen }">
      <TopBar :is-scrolled-top="isScrolledTop" :toggle-sidebar="toggleSidebar" :sidebar-open="sidebarOpen"
        :is-incognito="isIncognito" :show-incognito-button="!route.params.id && messages.length === 0" :messages="messages"
        :parameter-config-open="parameterConfigPanelOpen" :conversation-id="route.params.id"
        :can-export="canExport"
        @toggle-incognito="toggleIncognito"
        @toggle-parameter-config="parameterConfigPanelOpen = !parameterConfigPanelOpen"
        @export-chat="handleExportChat"
        @open-palette="isPaletteOpen = true" />

      <!-- Chat panel from the current page -->
      <slot />
    </div>
    <CommandPalette v-model:open="isPaletteOpen" :commands="paletteCommands" />
    <DialogRoot v-model:open="isSettingsOpen">
      <DialogPortal>
        <DialogOverlay class="dialog-overlay" />
        <DialogContent class="dialog-content-panel">
          <SettingsPanel :is-open="isSettingsOpen" :initial-tab="settingsInitialTab"
            @close="isSettingsOpen = false; settingsInitialTab = 'general';"
            @reload-settings="settingsManager.loadSettings" />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/github-dark.css';
import { inject } from "@vercel/analytics"
import { injectSpeedInsights } from '@vercel/speed-insights';
import { useDark } from "@vueuse/core";
import { useHead } from '@unhead/vue';
import { DialogRoot, DialogContent, DialogPortal, DialogOverlay } from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';

import { useSettings } from '~/composables/useSettings';
import { useGlobalScrollStatus } from '~/composables/useGlobalScrollStatus';
import { useGlobalIncognito } from '~/composables/useGlobalIncognito';

import AppSidebar from '~/components/AppSidebar.vue'
import SettingsPanel from '~/components/SettingsPanel.vue'
import ParameterConfigPanel from '~/components/ParameterConfigPanel.vue'
import TopBar from '~/components/TopBar.vue'
import CommandPalette from '~/components/CommandPalette.vue'
import { useKeyboardShortcuts } from '~/composables/useKeyboardShortcuts';
import { SHORTCUTS } from '~/composables/keyboardShortcuts';
import {
  exportSingleChatToZip,
  triggerDownload,
  generateSingleChatExportFilename,
} from '~/composables/importExport';

// Inject Vercel's analytics and performance insights
inject();
injectSpeedInsights();

const isDark = useDark();

// Use the shared settings instance
const settingsManager = useSettings();

// Use global scroll status
const { getIsScrolledTop } = useGlobalScrollStatus();

// Use global incognito state
const { isIncognito, toggleIncognito: globalToggleIncognito } = useGlobalIncognito();

// selectedModelId for potential future use
const selectedModelId = computed(() => settingsManager.settings.selected_model_id);

const route = useRoute(); // Get current route
const router = useRouter();

const sidebarOpen = ref(null); // null = indeterminate, will be set in onMounted based on screen width
const parameterConfigPanelOpen = ref(false);
const isSettingsOpen = ref(false);
const settingsInitialTab = ref('general'); // Controls which tab opens in settings panel

// Set up dynamic page title
const title = computed(() => {
  if (route.params.id) {
    return `${route.params.id} - Kira`;
  } else if (route.path === '/' || route.path === '/new') {
    return 'New Chat - Kira';
  } else {
    return 'Kira';
  }
});

useHead({
  title: title,
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'description', content: 'An open-source AI assistant interface' }
  ]
});

// Reactive state for TopBar functionality (placeholders since chat state is in pages)
const messages = ref([]); // Placeholder for messages
const isLoading = ref(false); // Placeholder for loading state
const controller = ref(new AbortController()); // Placeholder for controller
const currConvo = ref(route.params.id || ''); // Current conversation ID
const conversationTitle = ref(''); // Current conversation title
const isTyping = ref(false); // Typing state

// Show the per-chat export button only when viewing a specific chat
const canExport = computed(() => !!route.params.id && route.path !== '/incognito');

// Use the global scroll status instead of local state
const isScrolledTop = computed(() => getIsScrolledTop.value); // Track if chat is scrolled to the top

onMounted(async () => {
  await settingsManager.loadSettings();
  // Set sidebar open state based on window width (only in browser)
  if (typeof window !== 'undefined') {
    sidebarOpen.value = window.innerWidth >= 950;
  }
});

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
  // On mobile, when closing the sidebar, we might want to ensure focus returns to the main content
  if (!sidebarOpen.value && typeof window !== 'undefined' && window.innerWidth < 950) {
    // Focus on main content area for accessibility
    nextTick(() => {
      const mainContent = document.querySelector('.content-wrapper');
      if (mainContent) {
        mainContent.focus();
      }
    });
  }
}

function openSettingsPanel(tabKey = 'general') {
  settingsInitialTab.value = tabKey;
  isSettingsOpen.value = true;
}

function handleParameterConfigSave(params) {
  // The settings are already saved in the ParameterConfigPanel component.
  // Hook kept for any future additional actions (e.g. analytics).
}

function handleDeleteConversation(id) {
  // Pages own the actual delete logic; this is a placeholder for layout-level hooks.
}

function handleNewConversation() {
  router.push('/');
}

async function handleExportChat() {
  const id = route.params.id;
  if (!id || typeof id !== 'string') return;
  try {
    const blob = await exportSingleChatToZip(id);
    const filename = generateSingleChatExportFilename(id);
    triggerDownload(blob, filename);
  } catch (error) {
    console.error('[layout] Failed to export chat:', error);
  }
}

/**
 * Toggles incognito mode
 */
function toggleIncognito() {
  globalToggleIncognito();
}

//-- Command palette

const isPaletteOpen = ref(false);

/**
 * Every action the palette can run. Shortcut hints are pulled from the
 * shortcut registry rather than typed out, so a rebind can never leave a
 * stale hint behind.
 */
const paletteCommands = computed(() => {
  const commands = [
    {
      id: 'new-chat',
      label: 'New chat',
      icon: 'material-symbols:add-comment-outline',
      keywords: ['start', 'conversation', 'fresh'],
      hint: hintFor('new-chat'),
      run: handleNewConversation,
    },
    {
      id: 'toggle-incognito',
      label: isIncognito.value ? 'Leave incognito mode' : 'Start incognito chat',
      icon: 'material-symbols:visibility-off-outline',
      keywords: ['private', 'temporary', 'unsaved'],
      hint: hintFor('toggle-incognito'),
      run: toggleIncognito,
    },
    {
      id: 'toggle-sidebar',
      label: sidebarOpen.value ? 'Hide sidebar' : 'Show sidebar',
      icon: 'material-symbols:side-navigation',
      keywords: ['chats', 'threads', 'drawer'],
      hint: hintFor('toggle-sidebar'),
      run: toggleSidebar,
    },
    {
      id: 'toggle-parameters',
      label: parameterConfigPanelOpen.value ? 'Hide parameters' : 'Show parameters',
      icon: 'material-symbols:tune',
      keywords: ['temperature', 'top_p', 'seed', 'sampling', 'config'],
      hint: hintFor('toggle-parameters'),
      run: () => { parameterConfigPanelOpen.value = !parameterConfigPanelOpen.value; },
    },
    {
      id: 'toggle-theme',
      label: isDark.value ? 'Switch to light theme' : 'Switch to dark theme',
      icon: isDark.value ? 'material-symbols:light-mode-outline' : 'material-symbols:dark-mode-outline',
      keywords: ['dark', 'light', 'appearance', 'colour', 'color'],
      run: () => { isDark.value = !isDark.value; },
    },
    {
      id: 'open-notepad',
      label: 'Open Notepad',
      icon: 'material-symbols:note-outline',
      keywords: ['memory', 'notes', 'about me'],
      run: () => router.push('/notepad'),
    },
    {
      id: 'open-settings',
      label: 'Open settings',
      icon: 'material-symbols:settings-outline',
      keywords: ['preferences', 'options', 'api key'],
      run: () => openSettingsPanel('general'),
    },
    {
      id: 'open-customization',
      label: 'Edit custom instructions',
      icon: 'material-symbols:person-edit-outline',
      keywords: ['persona', 'name', 'occupation', 'system prompt'],
      run: () => openSettingsPanel('customization'),
    },
    {
      id: 'import-export',
      label: 'Import or export data',
      icon: 'material-symbols:database-outline',
      keywords: ['backup', 'restore', 'zip', 'download'],
      run: () => openSettingsPanel('data'),
    },
    {
      id: 'open-shortcuts',
      label: 'Keyboard shortcuts',
      icon: 'material-symbols:keyboard-outline',
      keywords: ['keybinds', 'hotkeys', 'bindings'],
      hint: hintFor('shortcut-help'),
      run: openShortcutHelp,
    },
  ];

  if (canExport.value) {
    commands.push({
      id: 'export-chat',
      label: 'Export this chat',
      icon: 'material-symbols:download',
      keywords: ['save', 'zip', 'download', 'backup'],
      run: handleExportChat,
    });
  }

  return commands;
});

//-- Keyboard shortcuts

function openShortcutHelp() {
  openSettingsPanel('keybinds');
}

useKeyboardShortcuts({
  openPalette: () => { isPaletteOpen.value = true; },
  toggleSidebar,
  toggleParameters: () => { parameterConfigPanelOpen.value = !parameterConfigPanelOpen.value; },
  newChat: handleNewConversation,
  toggleIncognito,
  openShortcutHelp,
});

/**
 * Looks up a registry shortcut's combo, e.g. "mod+alt+n". The palette renders
 * it through UiKbd, so the key caps match every other shortcut hint in the app.
 *
 * @param {string} id - A shortcut id from the registry.
 * @returns {string} The combo string, or an empty string if unknown.
 */
function hintFor(id) {
  return SHORTCUTS.find(entry => entry.id === id)?.combo ?? '';
}
</script>

<style scoped>
.app-container {
  display: flex;
  padding: 0;
  height: 100dvh;
  max-width: 100vw;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bg);
  position: relative;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
}

/*
  .main-container fills the viewport height and available width.
  Uses flexbox to allow the chat panel to grow/shrink and keep the message form at the bottom.
*/
.main-container {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  height: 100dvh;
  position: relative;
  background: inherit;
  width: 100%;
  overflow: hidden;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
  z-index: 10;
}

/* Sidebar open shifts main content right by sidebar width (280px) */
@media (min-width: 950px) {
  .main-container.sidebar-open {
    margin-left: 280px;
  }

  .main-container.parameter-config-open {
    margin-right: 300px;
  }

  .main-container.sidebar-open.parameter-config-open {
    margin-left: 280px;
    margin-right: 300px;
  }
}

/* Top bar styling */

/* Update fade transition timing */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Other display size styles */

@media (max-width: 1024px) {
  .flag {
    display: none;
  }
}

@media (max-width: 768px) {
  #disclaimer {
    margin-top: -16px;
    font-size: smaller;
  }

  .app-container {
    padding: 0;
    /* Remove padding that was causing scrollbar */
  }

  header {
    padding-top: 0px;
  }

  /* Ensure proper sidebar behavior on mobile - use overlay instead of transform */
  .main-container {
    transition: none;
    /* Remove transitions that interfere with positioning */
    transform: none;
  }

  .main-container.sidebar-open,
  .main-container.parameter-config-open,
  .main-container.sidebar-open.parameter-config-open {
    transform: none;
    margin: 0;
  }
}

/* Mobile-specific styles - use overlay instead of transform for better positioning */
@media (max-width: 949px) {
  .main-container {
    transform: none;
    /* Remove transforms that interfere with fixed positioning */
    margin: 0;
    /* Reset any margin changes */
  }

  /* Use overlay positioning for mobile panels */
  .sidebar-open .main-container,
  .parameter-config-open .main-container {
    transform: none;
    margin: 0;
  }
}

.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  z-index: 1001;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  background: transparent;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Matches UiDialog's overlay/panel treatment so every modal in the app
   enters the same way — the settings panel is just a wider one. */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(2px);
  z-index: 2000;
  animation: dialogFade var(--duration) var(--ease-out) both;
}

.dialog-content-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 2rem);
  max-width: 56rem;
  max-height: 90vh;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: var(--card);
  padding: 0;
  text-align: left;
  box-shadow: var(--shadow-overlay);
  z-index: 2001;
  animation: dialogPanelIn var(--duration-enter) var(--ease-out-strong) both;
}

@keyframes dialogFade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes dialogPanelIn {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>