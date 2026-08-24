<template>
  <!--
    Anchored popover panel for the model picker. Positioned below the
    trigger in the TopBar (the parent .ms-popover-wrap is the positioning
    context). Behaves like a menu: opens on the trigger, closes on outside
    click / Esc / selection.
  -->
  <div ref="panelRef" class="mpp-panel" role="menu" aria-label="Choose a model">
    <!-- Provider chips -->
    <div class="mp-providers">
      <button
        v-for="p in providers"
        :key="p.id"
        type="button"
        class="mp-provider-chip"
        :class="{ active: p.id === activeProviderId }"
        @click="switchProvider(p.id)"
      >
        {{ p.name }}
      </button>
    </div>

    <!-- Search -->
    <div class="mp-search">
      <Icon icon="material-symbols:search-rounded" width="18" height="18" class="mp-search-icon" />
      <input
        ref="searchInputRef"
        v-model="query"
        type="text"
        placeholder="Search models by name or id…"
        class="mp-search-input"
      />
      <button v-if="query" type="button" class="mp-clear" aria-label="Clear search" @click="query = ''">
        <Icon icon="material-symbols:close-rounded" width="14" height="14" />
      </button>
    </div>

    <!-- Body -->
    <div class="mp-body">
      <div v-if="loadingCatalog" class="mp-state">
        <div class="mp-spinner"></div>
        <p>Loading the model catalog…</p>
      </div>

      <template v-else>
        <!-- Favorites -->
        <template v-if="visibleFavorites.length > 0">
          <div class="mp-section-label">Favorites</div>
          <ModelPickerRow
            v-for="model in visibleFavorites"
            :key="`fav-${model.id}`"
            :model="model"
            :selected="model.id === selectedModelId"
            :favorite="true"
            @select="onSelect(model.id)"
            @toggle-favorite="toggleFavorite(model.id)"
          />
          <div v-if="visibleModels.length > 0" class="mp-divider"></div>
        </template>

        <!-- All models -->
        <div v-if="visibleModels.length > 0" class="mp-section-label">
          {{ query.trim() ? `Results (${filteredModels.length})` : 'All models' }}
        </div>
        <ModelPickerRow
          v-for="model in visibleModels"
          :key="model.id"
          :model="model"
          :selected="model.id === selectedModelId"
          :favorite="isFavorite(model.id)"
          @select="onSelect(model.id)"
          @toggle-favorite="toggleFavorite(model.id)"
        />

        <button
          v-if="hiddenCount > 0"
          type="button"
          class="mp-show-more"
          @click="showMore"
        >
          Show more ({{ hiddenCount }} more)
        </button>

        <div
          v-if="visibleModels.length === 0 && visibleFavorites.length === 0"
          class="mp-state"
        >
          <p>No models match "{{ query }}"</p>
        </div>
      </template>
    </div>

    <!-- Footer -->
    <div class="mp-footer">
      {{ allModels.length }} models · {{ providers.find(p => p.id === activeProviderId)?.name }}
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';
import { useModelPicker } from '~/composables/useModelPicker';
import ModelPickerRow from './ModelPickerRow.vue';

const props = defineProps({
  selectedModelId: { type: String, default: '' },
});

const emit = defineEmits(['close', 'model-selected']);

const picker = useModelPicker();
const {
  // state
  query,
  loadingCatalog,
  providers,
  activeProviderId,
  allModels,
  filteredModels,
  visibleModels,
  hiddenCount,
  visibleFavorites,
  // actions
  switchProvider,
  selectModel,
  toggleFavorite,
  isFavorite,
  showMore,
  resetForOpen,
  ensureCatalogLoaded,
} = picker;

const searchInputRef = ref(null);
const panelRef = ref(null);

function onDocumentPointerDown(event) {
  const target = event.target;
  if (panelRef.value?.contains(target)) return;
  // Clicks on the trigger button itself are handled by its own handler
  // (it toggles); ignore them here so we don't double-fire.
  if (target.closest?.('.model-selector-btn')) return;
  emit('close');
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}

// Bootstrap: reset state, make sure the catalog is loaded, focus search,
// and install outside-click/Esc dismissal for as long as we're mounted.
onMounted(async () => {
  resetForOpen();
  await ensureCatalogLoaded();
  await nextTick();
  searchInputRef.value?.focus();
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onKeyDown, true);
});

function onSelect(modelId) {
  selectModel(modelId);
  emit('model-selected', modelId);
  emit('close');
}
</script>

<style scoped>
.mpp-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: min(460px, calc(100vw - 32px));
  max-height: min(560px, calc(100dvh - 120px));
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-xl, 0 16px 48px rgba(0, 0, 0, 0.22));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1500;
}

/* Provider chips */
.mp-providers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px 8px;
  flex-shrink: 0;
}

.mp-provider-chip {
  white-space: nowrap;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mp-provider-chip:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.mp-provider-chip.active {
  border-color: var(--primary);
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

/* Search */
.mp-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 12px 10px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  background: var(--bg-input, var(--bg-secondary));
}

.mp-search:focus-within {
  border-color: var(--primary);
}

.mp-search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.mp-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 9px 0;
  font-size: 0.88rem;
  color: var(--text-primary);
}

.mp-clear {
  display: flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}

/* Body */
.mp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.mp-section-label {
  padding: 8px 8px 4px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  user-select: none;
}

.mp-divider {
  height: 1px;
  background: var(--border);
  margin: 8px;
}

.mp-show-more {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 9px;
  border-radius: var(--radius-md, 10px);
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.82rem;
  cursor: pointer;
}

.mp-show-more:hover {
  color: var(--primary);
  border-color: var(--primary);
}

.mp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 16px;
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.mp-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: mp-spin 0.8s linear infinite;
}

@keyframes mp-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Footer */
.mp-footer {
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 0.74rem;
  color: var(--text-muted);
}
</style>
