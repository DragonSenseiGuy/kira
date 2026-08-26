<template>
  <div class="settings-page">
    <!-- Mobile section nav -->
    <div class="settings-mobile-nav">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="mobile-nav-pill"
        :class="{ active: activeSection === item.key }"
        @click="setSection(item.key)"
      >
        <Icon :icon="item.icon" width="16" height="16" />
        {{ item.label }}
      </button>
    </div>

    <div class="settings-shell">
      <!-- Desktop sidebar nav -->
      <aside class="settings-nav">
        <nav class="settings-nav-items">
          <button
            v-for="item in navItems"
            :key="item.key"
            class="nav-item"
            :class="{ active: activeSection === item.key }"
            @click="setSection(item.key)"
          >
            <Icon :icon="item.icon" width="20" height="20" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <!-- Content -->
      <main class="settings-content">
        <div class="content-inner">
          <component :is="sectionComponent" />
        </div>
      </main>
    </div>

    <ExportMenu :is-open="isExportMenuOpen" @close="isExportMenuOpen = false" />
    <ImportMenu
      :is-open="isImportMenuOpen"
      @close="isImportMenuOpen = false"
      @import-complete="onImportComplete"
    />

    <!-- Toast -->
    <Transition name="toast-fade">
      <div v-if="toast" class="settings-toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useHead } from '@unhead/vue';
import { Icon } from '@iconify/vue';
import { useDark, useToggle } from '@vueuse/core';
import ExportMenu from '~/components/ExportMenu.vue';
import ImportMenu from '~/components/ImportMenu.vue';
import SettingsGeneral from '~/components/settings/SettingsGeneral.vue';
import SettingsCustomization from '~/components/settings/SettingsCustomization.vue';
import SettingsProviders from '~/components/settings/SettingsProviders.vue';
import SettingsSearch from '~/components/settings/SettingsSearch.vue';
import SettingsAutonomy from '~/components/settings/SettingsAutonomy.vue';
import SettingsMemory from '~/components/settings/SettingsMemory.vue';
import SettingsCompression from '~/components/settings/SettingsCompression.vue';
import SettingsData from '~/components/settings/SettingsData.vue';
import SettingsKeybinds from '~/components/settings/SettingsKeybinds.vue';
import SettingsAbout from '~/components/settings/SettingsAbout.vue';

const route = useRoute();
const router = useRouter();

const navItems = [
  { key: 'general', label: 'General', icon: 'material-symbols:tune-rounded', component: SettingsGeneral },
  { key: 'customization', label: 'Customization', icon: 'material-symbols:person-outline-rounded', component: SettingsCustomization },
  { key: 'providers', label: 'Providers', icon: 'material-symbols:lan-outline-rounded', component: SettingsProviders },
  { key: 'search', label: 'Search & Tools', icon: 'material-symbols:travel-explore-outline-rounded', component: SettingsSearch },
  { key: 'autonomy', label: 'Autonomy', icon: 'material-symbols:settings-accessibility-outline-rounded', component: SettingsAutonomy },
  { key: 'memory', label: 'Memory', icon: 'material-symbols:note-alt-outline-rounded', component: SettingsMemory },
  { key: 'compression', label: 'Context Compression', icon: 'material-symbols:compress-rounded', component: SettingsCompression },
  { key: 'data', label: 'Data', icon: 'material-symbols:database-outline-rounded', component: SettingsData },
  { key: 'keybinds', label: 'Shortcuts', icon: 'material-symbols:keyboard-outline-rounded', component: SettingsKeybinds },
  { key: 'about', label: 'About', icon: 'material-symbols:info-outline-rounded', component: SettingsAbout },
];

const VALID_KEYS = navItems.map((i) => i.key);

const activeSection = ref(
  VALID_KEYS.includes(route.query.tab) ? route.query.tab : 'general',
);

const sectionComponent = computed(
  () => navItems.find((i) => i.key === activeSection.value)?.component,
);

function setSection(key) {
  activeSection.value = key;
  // Deep-linkable without triggering a full re-navigation scroll jump.
  router.replace({ query: { ...route.query, tab: key } });
}

// ---------------------------------------------------------------------------
// Shared services provided to every settings section
// ---------------------------------------------------------------------------

const isExportMenuOpen = ref(false);
const isImportMenuOpen = ref(false);

let toastTimer = null;
const toast = ref('');

function showToast(message) {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
    toastTimer = null;
  }, 2600);
}

provide('settings-ui', {
  openExportMenu: () => {
    isExportMenuOpen.value = true;
  },
  openImportMenu: () => {
    isImportMenuOpen.value = true;
  },
  showToast,
  navigateToNotepad: () => router.push('/notepad'),
});

function onImportComplete() {
  showToast('Import complete');
}

useHead({
  title: 'Settings - Libre Assistant',
});

definePageMeta({
  layout: 'default',
});
</script>

<style scoped>
/*
 * The layout's .main-container clips overflow (#app is overflow:hidden),
 * so — like the notepad page — this page fills the container and the
 * SHELL is the scroll container. The page itself stays transparent so
 * the application background shows through.
 */
.settings-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  box-sizing: border-box;
}

/* --- Mobile nav pills --- */
.settings-mobile-nav {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex-shrink: 0;
  padding: 12px 16px 4px;
  scrollbar-width: none;
}

.settings-mobile-nav::-webkit-scrollbar {
  display: none;
}

.mobile-nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mobile-nav-pill.active {
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}

/* --- Shell (scroll container) --- */
.settings-shell {
  display: flex;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  min-height: 0;
  overflow-y: auto;
  /* NOTE: no bottom padding here — padding on a flex scroll container is
     excluded from the scrollable area in Chromium/Firefox. The trailing
     space lives on .content-inner instead. */
  padding: 24px 16px 0;
  gap: 32px;
  box-sizing: border-box;
}

.settings-nav {
  width: 230px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  align-self: flex-start;
  display: none;
}

.settings-nav-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius-md, 10px);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.92rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.nav-item:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--btn-hover);
  color: var(--primary);
  font-weight: 600;
}

/* --- Content --- */
.settings-content {
  flex: 1;
  min-width: 0;
}

.content-inner {
  /* Trailing space for every tab — lives here (not on the scroll
     container) so it's actually included in the scroll extent. */
  padding-bottom: 72px;
  animation: settings-fade-in 0.18s ease;
}

@keyframes settings-fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 900px) {
  .settings-mobile-nav {
    display: none;
  }
  .settings-nav {
    display: block;
  }
}

/* --- Toast --- */
.settings-toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.15));
  padding: 10px 18px;
  font-size: 0.9rem;
  z-index: 3000;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
