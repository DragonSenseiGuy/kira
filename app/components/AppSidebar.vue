<script setup>
import { ref, onBeforeUnmount, onMounted, nextTick, computed } from "vue";
import { Icon } from "@iconify/vue";
import { useRouter, useRoute } from "vue-router";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "reka-ui";
import { useConversationsList } from "~/composables/useConversationsList";
import { useSettings } from "~/composables/useSettings";
import { useAuth } from "~/composables/useAuth";

const emit = defineEmits([
  "reloadSettings",
  "toggleDark",
  "closeSidebar",
  "openSettings",
]);
const props = defineProps(["currConvo", "messages", "isDark", "isOpen"]);

const router = useRouter();
const route = useRoute();

// Use settings to check for API key
const settingsManager = useSettings();

// Account state. With no database configured there is nothing to sign in
// to, so the footer stays empty rather than showing a dead action.
const { accountsEnabled, user, logout } = useAuth();

async function handleSignOut() {
  await logout();
  router.push("/login");
}
const hasApiKey = computed(() => !!settingsManager.settings.custom_api_key);

// Use the conversations list composable
const {
  metadata,
  searchQuery,
  renamingId,
  newTitle,
  groupedConversations,
  isSearching,
  togglePin,
  handleDelete,
  startRename,
  cancelRename,
  saveRename,
  handleRenameKeydown,
  clearSearch,
} = useConversationsList();

const windowWidth = ref(
  typeof window !== "undefined" ? window.innerWidth : 1200,
);

// Collapsible pinned section state
const isPinnedExpanded = ref(true);

function togglePinnedExpanded() {
  isPinnedExpanded.value = !isPinnedExpanded.value;
}

function handleResize() {
  windowWidth.value = window.innerWidth;
}

onMounted(() => {
  window.addEventListener("resize", handleResize);
  handleResize();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
});

function closeSidebar() {
  emit("closeSidebar");
}

function handleNewConversation() {
  router.push("/");
}

function handleMiddleClickNewChat(e) {
  if (e.button === 1) {
    e.preventDefault();
    window.open('/', '_blank');
  }
}
</script>

<template>
  <div>
    <div :class="['sidebar-overlay', { active: props.isOpen }]" @click="closeSidebar"></div>
    <div :class="['sidebar', { active: props.isOpen }]">
      <div class="sidebar-header">
        <UiTooltip content="Close sidebar" side="bottom" shortcut="mod+b">
          <UiIconButton
            icon="material-symbols:side-navigation"
            label="Close sidebar"
            @click="closeSidebar"
          />
        </UiTooltip>
        <span class="sidebar-title">Kira</span>
        <UiTooltip content="Settings" side="bottom">
          <UiIconButton
            icon="material-symbols:settings-outline"
            label="Open settings"
            @click="$emit('openSettings')"
          />
        </UiTooltip>
      </div>

      <UiButton
        id="new-chat-button"
        variant="ghost"
        icon="material-symbols:edit-square-outline-rounded"
        block
        @click="handleNewConversation"
        @auxclick="handleMiddleClickNewChat"
      >
        New chat
      </UiButton>

      <!-- Search Input -->
      <div class="search-container">
        <Icon icon="material-symbols:search" class="search-icon" width="18" height="18" />
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search chats"
        />
        <UiIconButton
          v-if="searchQuery"
          icon="material-symbols:close"
          label="Clear search"
          size="sm"
          class="search-clear"
          @click="clearSearch"
        />
      </div>

      <div class="main-content" style="padding-bottom: 0;">
        <!-- Empty state when no conversations -->
        <UiEmptyState
          v-if="!metadata.length"
          icon="material-symbols:chat-bubble-outline"
          title="No conversations yet"
          description="Start a new chat to begin"
        />

        <!-- Empty search results -->
        <UiEmptyState
          v-else-if="isSearching && !groupedConversations.length"
          icon="material-symbols:search"
          title="No results found"
          description="Try a different search term"
        />

        <!-- Grouped conversation list -->
        <div v-else class="conversation-list">
          <template v-for="(group, index) in groupedConversations" :key="group.key">
            <!-- Group Header -->
            <div class="group-header">
              <span class="group-label">
                <Icon
                  v-if="group.key === 'pinned'"
                  icon="boxicons:pin-alt-filled"
                  width="14"
                  height="14"
                  class="header-pin-icon"
                />
                {{ group.label }}
              </span>
              <UiIconButton
                v-if="group.key === 'pinned'"
                icon="material-symbols:keyboard-arrow-down-rounded"
                label="Toggle pinned section"
                size="sm"
                class="collapse-btn"
                :class="{ 'is-collapsed': !isPinnedExpanded }"
                @click="togglePinnedExpanded"
              />
            </div>
            
            <!-- Conversations in this group -->
            <template v-if="group.key !== 'pinned' || isPinnedExpanded">
              <div
                v-for="data in group.conversations"
                :key="data.id"
                class="conversation-wrapper"
              >
                <!-- Rename input (shown when renaming) -->
                <input
                  v-if="renamingId === data.id"
                  v-model="newTitle"
                  class="rename-input"
                  @keydown="handleRenameKeydown($event, data.id)"
                  @blur="saveRename(data.id)"
                  ref="renameInput"
                  autofocus
                />
                
                <!-- Normal conversation button (shown when not renaming) -->
                <NuxtLink
                  v-else
                  class="conversation-button"
                  :to="`/${data.id}`"
                  :class="{ active: data.id == route.params.id }"
                >
                  <span class="conversation-title">{{ data.title }}</span>
                </NuxtLink>
                
                <!-- Dropdown Menu -->
                <DropdownMenuRoot v-if="renamingId !== data.id">
                  <DropdownMenuTrigger class="menu-trigger" @click.stop aria-label="More options">
                    <Icon icon="material-symbols:more-horiz" width="18" height="18" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="conversation-menu-dropdown" side="bottom" align="start" :side-offset="4">
                    <DropdownMenuItem class="conversation-menu-item" @select="togglePin(data.id)">
                      <Icon
                        :icon="data.pinned ? 'material-symbols:keep-off-outline' : 'material-symbols:keep-outline'"
                        width="16"
                        height="16"
                      />
                      <span>{{ data.pinned ? 'Unpin' : 'Pin' }}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem class="conversation-menu-item" @select="startRename(data.id, data.title)">
                      <Icon icon="material-symbols:edit-outline" width="16" height="16" />
                      <span>Rename</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem class="conversation-menu-item delete-item" @select="handleDelete(data.id)">
                      <Icon icon="material-symbols:delete" width="16" height="16" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuRoot>
              </div>
            </template>
          </template>
        </div>
      </div>
      <!-- API Key Warning -->
      <div v-if="!hasApiKey" class="api-key-warning">
        <Icon icon="material-symbols:warning" width="20" height="20" />
        <div class="warning-content">
          <span class="warning-title">API Key Required</span>
          <span class="warning-text">Add your API key in settings</span>
        </div>
        <UiIconButton
          icon="material-symbols:arrow-forward"
          label="Open settings"
          variant="subtle"
          size="sm"
          @click="$emit('openSettings')"
        />
      </div>

      <div v-if="accountsEnabled" class="sidebar-footer">
        <template v-if="user">
          <div class="account-row">
            <Icon icon="ph:user-circle" width="18" height="18" class="account-avatar" />
            <span class="account-email" :title="user.email">{{ user.email }}</span>
          </div>
          <UiButton
            variant="ghost"
            icon="material-symbols:logout-rounded"
            block
            class="login-btn"
            @click="handleSignOut"
          >
            Sign out
          </UiButton>
        </template>
        <UiButton
          v-else
          variant="ghost"
          icon="material-symbols:login-rounded"
          block
          class="login-btn"
          @click="router.push('/login')"
        >
          Log in
        </UiButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100dvh;
  width: 260px;
  max-width: 90vw;
  z-index: 1001;
  background: var(--bg-sidebar);
  color: var(--text-primary);
  /* No rule between rail and canvas — the tone step does the separating,
     which is how ChatGPT keeps the shell quiet. */
  border-right: none;
  transform: translateX(-100%);
  transition: transform var(--duration-slow) var(--ease-out-strong);
  display: flex;
  flex-direction: column;
}

.sidebar.active {
  transform: translateX(0);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  color: var(--text-primary);
  padding: 0 8px;
  position: relative;
  flex-shrink: 0;
}

.sidebar-title {
  font-family: var(--font);
  font-size: 1.05em;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

/* Rail rows: full-width, left-aligned, pill hover. New chat and search are
   the same shape as a conversation row so the rail reads as one list. */
#new-chat-button {
  margin: 4px 8px 2px;
  width: calc(100% - 16px);
  height: 38px;
  padding: 0 10px;
  flex-shrink: 0;
  border-radius: var(--radius-control);
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-primary);
  justify-content: flex-start;
}

#new-chat-button :deep(.ui-btn__body) {
  gap: 10px;
}

/* Search Container */
.search-container {
  margin: 0 8px 8px;
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: var(--radius-control);
  transition: background var(--duration-fast) var(--ease-out);
}

.search-container:hover {
  background: var(--btn-hover);
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-primary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 38px;
  padding: 0 32px 0 40px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  box-shadow: none;
  color: var(--text-primary);
  font-size: 0.875rem;
  font-family: inherit;
  transition: box-shadow var(--duration) var(--ease-out);
}

.search-input::placeholder {
  color: var(--text-placeholder);
}

.search-input:focus {
  outline: none;
  box-shadow: 0 0 0 1px var(--line-strong);
}

.search-clear {
  position: absolute;
  right: 5px;
}

.main-content {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 0 8px;
  margin-bottom: 0;
}

/* Sidebar Footer */
.sidebar-footer {
  padding: 8px;
  flex-shrink: 0;
  border-top: none;
}

/* The footer action reads as a row, not a centred button */
.login-btn :deep(.ui-btn__body) {
  margin-right: auto;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 8px;
  min-width: 0;
}

.account-avatar {
  color: var(--text-muted);
  flex-shrink: 0;
}

.account-email {
  font-size: 0.78rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Conversation List */
.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Group Header */
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 4px;
  margin-top: 8px;
  height: 32px;
}

.group-header:first-child {
  margin-top: 0;
}

.group-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-muted);
  user-select: none;
}

.header-pin-icon {
  color: var(--text-muted);
}

.collapse-btn {
  margin-right: -6px;
}

/* One chevron that rotates, so the control's meaning stays put */
.collapse-btn :deep(svg) {
  transition: transform var(--duration) var(--ease-out-strong);
}

.collapse-btn.is-collapsed :deep(svg) {
  transform: rotate(-90deg);
}

.conversation-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.conversation-button {
  flex-grow: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  text-align: left;
  background: none;
  color: var(--text-primary);
  border: none;
  border-radius: var(--radius-control);
  padding: 8px 10px;
  padding-right: 40px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 500;
  text-decoration: none;
  transition:
    background var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out);
  min-width: 0;
  width: 100%;
}

.conversation-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pin-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.conversation-button {
  color: var(--text-primary);
}

.conversation-button:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

/* The open thread is marked by a neutral fill, not a coloured one — colour
   in the rail would be the loudest thing on screen. */
.conversation-button.active {
  background: var(--hover-2);
  color: var(--text-primary);
  font-weight: 500;
}

/* Rename input */
.rename-input {
  flex-grow: 1;
  background: var(--bg-input);
  color: var(--text-primary);
  border: none;
  box-shadow: 0 0 0 1px var(--line-strong);
  border-radius: var(--radius-control);
  padding: 8px 10px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  width: 100%;
}

.rename-input:focus {
  box-shadow: 0 0 0 1px var(--ink-3);
}

/* Menu trigger button (3-dot) */
.menu-trigger {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  aspect-ratio: 1;
  background: transparent;
  border: none;
  padding: 0;
  border-radius: var(--radius-chip);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
  color: var(--text-primary);
  z-index: 1;
}

.conversation-wrapper:hover .menu-trigger,
.conversation-button.active + .menu-trigger,
.conversation-wrapper:has(.conversation-button.active) .menu-trigger {
  opacity: 0.6;
}

.menu-trigger:hover {
  opacity: 1 !important;
  background: var(--btn-hover-2);
}

.conversation-wrapper:has(.conversation-button.active) .menu-trigger:hover {
  background: transparent;
}

.menu-trigger[data-state="open"] {
  opacity: 1 !important;
  background: var(--btn-hover);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: var(--scrim);
  opacity: 0;
  z-index: 1000;
  transition: opacity var(--duration-slow) var(--ease-out-strong);
  will-change: opacity;
  pointer-events: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.sidebar-overlay.active {
  opacity: 1;
  pointer-events: auto;
}

@media (min-width: 950px) {
  .sidebar {
    position: fixed;
  }

  .sidebar-overlay {
    display: none;
  }
}

@media (max-width: 949px) {
  .sidebar {
    position: fixed;
    width: 80vw;
    max-width: 340px;
    box-shadow: 4px 0 24px #0002;
  }

  .dark .sidebar {
    box-shadow: 4px 0 24px #0004;
  }
}

@media (max-width: 600px) {
  .conversation-button {
    font-size: 0.9em;
  }
}

/* API Key Warning */
.api-key-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Same 8px gutter as every other rail row, so the notice lines up with
     the conversation list instead of sitting inset from it. */
  margin: 8px 8px 12px;
  padding: 10px 12px;
  background: var(--orange-tint);
  border: none;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--warning) 25%, transparent);
  border-radius: var(--radius-card);
  color: var(--text-primary);
}

.api-key-warning > svg {
  flex-shrink: 0;
  color: var(--warning);
}

.warning-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.warning-title {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--warning);
}

/* The rail is 260px wide; the sentence does not fit on one line there, so it
   wraps rather than clipping to "Add your API key in setti…". */
.warning-text {
  font-size: 0.75em;
  line-height: 1.35;
  color: var(--text-secondary);
}

</style>
