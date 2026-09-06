<template>
  <div class="app-container" :style="{ '--dock-w': dockWidth + 'px' }">
    <Suspense v-if="sidebarOpen !== null">
      <AppSidebar :curr-convo="route.params.id" :messages="[]" :is-open="sidebarOpen"
        @close-sidebar="sidebarOpen = false" @toggle-sidebar="toggleSidebar"
        :is-dark="isDark" @delete-conversation="handleDeleteConversation"
        @new-conversation="handleNewConversation"
        @reload-settings="settingsManager.loadSettings" @open-settings="openSettingsPanel('general')" />
      <!-- Opens to General tab -->
    </Suspense>
    <ParameterConfigPanel :is-open="activeDock === 'parameters'" :settings-manager="settingsManager"
      @close="activeDock = null" @save="handleParameterConfigSave" />
    <WorkspacePanel :is-open="activeDock === 'workspace'" :settings-manager="settingsManager"
      :sidebar-open="sidebarOpen === true"
      @close="activeDock = null" @save="handleWorkspacePanelSave"
      @resize="(w) => (workspaceWidth = w)" @sidebar-close="sidebarOpen = false" />
    <NetConsentHost />
    <AppDialogHost />
    <!--
      Restructured layout:
      - app-container: Main flex container with sidebar
      - main-container: Full width/height container for chat content
      - NuxtPage: Takes full width with internal max-width constraint (contains page-specific content)
    -->
    <div class="main-container"
      :class="{ 'sidebar-open': sidebarOpen, 'dock-open': activeDock }">
      <TopBar :is-scrolled-top="isScrolledTop" :toggle-sidebar="toggleSidebar" :sidebar-open="sidebarOpen"
        :is-incognito="isIncognito" :show-incognito-button="!route.params.id && messages.length === 0" :messages="messages"
        :parameter-config-open="activeDock === 'parameters'" :workspace-open="activeDock === 'workspace'"
        :conversation-id="route.params.id"
        :can-export="canExport"
        @toggle-incognito="toggleIncognito"
        @toggle-parameter-config="toggleParameterPanel"
        @toggle-workspace="toggleWorkspacePanel"
        @export-chat="handleExportChat"
        @open-palette="isPaletteOpen = true" />

      <!-- Chat panel from the current page -->
      <slot />
    </div>
    <CommandPalette v-model:open="isPaletteOpen" :commands="paletteCommands" />
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
import { useRoute, useRouter } from 'vue-router';

import { useSettings } from '~/composables/useSettings';
import { useGlobalScrollStatus } from '~/composables/useGlobalScrollStatus';
import { useGlobalIncognito } from '~/composables/useGlobalIncognito';
import { useKeybinds } from '~/composables/useKeybinds';
import { useLayoutRouteWatch } from '~/composables/useLayoutRouteWatch';

import AppSidebar from '~/components/AppSidebar.vue'
import WorkspacePanel from '~/components/WorkspacePanel.vue'
import TopBar from '~/components/TopBar.vue'
import CommandPalette from '~/components/CommandPalette.vue'
import ParameterConfigPanel from '~/components/ParameterConfigPanel.vue'
import { KEYBIND_ACTIONS } from '~/utils/keybinds';
import NetConsentHost from '~/components/NetConsentHost.vue'
import AppDialogHost from '~/components/AppDialogHost.vue'
import {
  exportSingleChatToZip,
  triggerDownload,
  generateSingleChatExportFilename,
} from '~/composables/importExport';

const isDark = useDark();

// Use the shared settings instance
const settingsManager = useSettings();

// Use global scroll status
const { getIsScrolledTop } = useGlobalScrollStatus();

// Use global incognito state
const { isIncognito, toggleIncognito: globalToggleIncognito } = useGlobalIncognito();

const route = useRoute(); // Get current route
const router = useRouter();

const sidebarOpen = ref(null); // null = indeterminate, will be set in onMounted based on screen width

// Both docks live on the same right-hand edge, so one value names whichever
// occupies it: null | 'parameters' | 'workspace'. Assignment *is* mutual
// exclusion — there is no state where both are open to guard against.
const activeDock = ref(null);

const workspaceWidth = ref(0); // px; reported by the Files dock (normal vs expanded)
const PARAMETER_DOCK_WIDTH = 300; // px; matches .parameter-config-panel

// Width of whichever dock is currently occupying the edge, so --dock-w can
// never hold a stale workspace width while the parameter dock is open.
const dockWidth = computed(() => {
  if (activeDock.value === 'parameters') return PARAMETER_DOCK_WIDTH;
  if (activeDock.value === 'workspace') return workspaceWidth.value;
  return 0;
});

// Route side effects (workspace scope, staging discard, mobile panel
// closes) live in a composable so they can be unit-tested.
useLayoutRouteWatch(route, {
  sidebarOpen,
  dockOpen: computed({
    get: () => activeDock.value !== null,
    set: (open) => { if (!open) activeDock.value = null; },
  }),
});

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
  // Settings now live on their own page; deep-link the section.
  router.push({ path: '/settings', query: tabKey && tabKey !== 'general' ? { tab: tabKey } : {} });
}

function toggleDock(dock) {
  activeDock.value = activeDock.value === dock ? null : dock;
}

function toggleParameterPanel() {
  toggleDock('parameters');
}

function toggleWorkspacePanel() {
  toggleDock('workspace');
}

function handleParameterConfigSave() {
  // The settings are already saved in the ParameterConfigPanel component.
}

function handleWorkspacePanelSave(params) {
  // The settings are already saved in the WorkspacePanel component.
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
      hint: hintFor('new_chat'),
      run: handleNewConversation,
    },
    {
      id: 'toggle-incognito',
      label: isIncognito.value ? 'Leave incognito mode' : 'Start incognito chat',
      icon: 'material-symbols:visibility-off-outline',
      keywords: ['private', 'temporary', 'unsaved'],
      hint: hintFor('toggle_incognito'),
      run: toggleIncognito,
    },
    {
      id: 'toggle-sidebar',
      label: sidebarOpen.value ? 'Hide sidebar' : 'Show sidebar',
      icon: 'material-symbols:side-navigation',
      keywords: ['chats', 'threads', 'drawer'],
      hint: hintFor('toggle_sidebar'),
      run: toggleSidebar,
    },
    {
      id: 'toggle-parameters',
      label: activeDock.value === 'parameters' ? 'Hide parameters' : 'Show parameters',
      icon: 'material-symbols:tune',
      keywords: ['temperature', 'top_p', 'seed', 'sampling', 'config'],
      hint: hintFor('toggle_parameters'),
      run: toggleParameterPanel,
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

useKeybinds({
  // The palette shortcut toggles: the same keys that opened it close it
  // again, which is what every other ⌘K palette does.
  open_palette: () => { isPaletteOpen.value = !isPaletteOpen.value; },
  toggle_sidebar: toggleSidebar,
  toggle_parameters: toggleParameterPanel,
  new_chat: handleNewConversation,
  toggle_incognito: toggleIncognito,
});

/**
 * Looks up an action's CURRENT combo, e.g. "mod+alt+n". Reads the user's
 * bindings first so a rebind in Settings -> Shortcuts is reflected in the
 * palette immediately, falling back to the shipped default.
 *
 * @param {string} id - A keybind action id.
 * @returns {string} The combo string, or an empty string if unknown.
 */
function hintFor(id) {
  const bound = settingsManager.settings?.keybinds?.[id];
  if (bound) return bound;
  return KEYBIND_ACTIONS.find(entry => entry.id === id)?.default ?? '';
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

/* Sidebar open shifts main content right by sidebar width (260px) */
@media (min-width: 950px) {
  .main-container.sidebar-open {
    margin-left: 260px;
  }

  .main-container.dock-open {
    margin-right: var(--dock-w, 380px);
  }

  .main-container.sidebar-open.dock-open {
    margin-left: 260px;
    margin-right: var(--dock-w, 380px);
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
  .main-container.dock-open,
  .main-container.sidebar-open.dock-open {
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
  .dock-open .main-container {
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
</style>


