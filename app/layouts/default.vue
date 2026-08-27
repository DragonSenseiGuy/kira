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
    <WorkspacePanel :is-open="workspacePanelOpen" :settings-manager="settingsManager"
      :sidebar-open="sidebarOpen === true"
      @close="workspacePanelOpen = false" @save="handleWorkspacePanelSave"
      @resize="(w) => (dockWidth = w)" @sidebar-close="sidebarOpen = false" />
    <NetConsentHost />
    <AppDialogHost />
    <!--
      Restructured layout:
      - app-container: Main flex container with sidebar
      - main-container: Full width/height container for chat content
      - NuxtPage: Takes full width with internal max-width constraint (contains page-specific content)
    -->
    <div class="main-container"
      :class="{ 'sidebar-open': sidebarOpen, 'workspace-open': workspacePanelOpen }">
      <TopBar :is-scrolled-top="isScrolledTop" :selected-model-name="selectedModelName"
        :selected-model-id="selectedModelId" :toggle-sidebar="toggleSidebar" :sidebar-open="sidebarOpen"
        :is-incognito="isIncognito" :show-incognito-button="!route.params.id && messages.length === 0" :messages="messages"
        :workspace-open="workspacePanelOpen" :conversation-id="route.params.id"
        :can-export="canExport" @model-selected="handleModelSelect"
        @toggle-incognito="toggleIncognito"
        @toggle-workspace="workspacePanelOpen = !workspacePanelOpen"
        @export-chat="handleExportChat" />

      <!-- Chat panel from the current page -->
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/github-dark.css';
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

// Compute selectedModelName from settingsManager to maintain reactivity
const selectedModelName = computed(() => settingsManager.selectedModelName);
const selectedModelId = computed(() => settingsManager.settings.selected_model_id);

const route = useRoute(); // Get current route
const router = useRouter();

const sidebarOpen = ref(null); // null = indeterminate, will be set in onMounted based on screen width
const workspacePanelOpen = ref(false);
const dockWidth = ref(0); // px; driven by the Files dock (normal vs expanded)

// Route side effects (workspace scope, staging discard, mobile panel
// closes) live in a composable so they can be unit-tested.
useLayoutRouteWatch(route, {
  sidebarOpen,
  dockOpen: workspacePanelOpen,
});

// Set up dynamic page title
const title = computed(() => {
  if (route.params.id) {
    return `${route.params.id} - Libre Assistant`;
  } else if (route.path === '/' || route.path === '/new') {
    return 'New Chat - Libre Assistant';
  } else {
    return 'Libre Assistant';
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
 * Handles model selection from the TopBar component.
 * Updates the settings with the selected model.
 */
function handleModelSelect(modelId, modelName) {
  settingsManager.settings.selected_model_id = modelId;
  settingsManager.saveSettings();
}

/**
 * Toggles incognito mode
 */
function toggleIncognito() {
  globalToggleIncognito();
}

//-- Keyboard shortcuts (user-configurable, see Settings → Shortcuts)
useKeybinds({
  toggle_sidebar: () => toggleSidebar(),
  toggle_parameters: () => {
    workspacePanelOpen.value = !workspacePanelOpen.value;
  },
  new_chat: () => handleNewConversation(),
  toggle_incognito: () => toggleIncognito(),
});
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
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
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
  transition: all 0.3s cubic-bezier(.4, 1, .6, 1);
  z-index: 10;
}

/* Sidebar open shifts main content right by sidebar width (280px) */
@media (min-width: 950px) {
  .main-container.sidebar-open {
    margin-left: 280px;
  }

  .main-container.workspace-open {
    margin-right: var(--dock-w, 380px);
  }

  .main-container.sidebar-open.workspace-open {
    margin-left: 280px;
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
  .main-container.workspace-open,
  .main-container.sidebar-open.workspace-open {
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
  .workspace-open .main-container {
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


