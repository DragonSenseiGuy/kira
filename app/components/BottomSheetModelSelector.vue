<template>
  <Motion
    v-if="isOpen"
    :initial="{ opacity: 0 }"
    :animate="isClosing ? { opacity: 0} : { opacity: 0.5}"
    :exit="{ opacity: 0 }"
    :transition="{ duration: 0.28, ease: EASE }"
    class="backdrop"
    @click="closeSheet"
  ></Motion>

  <Motion
    v-if="isOpen"
    :initial="{ y: '100%', opacity: 1 }"
    :animate="isClosing ? { y: '100%'} : { y: '0%'}"
    :exit="{ y: '100%', opacity: 0 }"
    :transition="FILL"
    :on-animation-complete="onAnimationComplete"
    class="bottom-sheet-container"
    @click.stop
  >

    <div class="content-wrapper">
      <!-- Grabber + title -->
      <div class="sheet-grabber" aria-hidden="true"></div>
      <div class="sheet-header">
        <h2 class="header-text">Choose a model</h2>
      </div>

      <!-- Provider tabs: one tap switches the visible catalog. Horizontally
           scrollable so any number of custom providers fits. -->
      <div class="provider-tabs" role="tablist" aria-label="Providers">
        <button
          v-for="provider in providers"
          :key="provider.id"
          type="button"
          role="tab"
          class="provider-tab"
          :class="{ active: provider.id === activeProviderId }"
          :aria-selected="provider.id === activeProviderId"
          @click="onProviderTap(provider)"
        >
          {{ provider.name }}
        </button>
      </div>

      <!-- Active provider's searchable model list -->
      <div class="models-body">
        <div class="model-search-box" @keydown.stop>
          <Icon icon="material-symbols:search-rounded" width="18" height="18" class="search-icon" />
          <input
            v-model="query"
            type="text"
            placeholder="Search by name or id…"
            class="model-search-input"
          />
        </div>

        <div v-if="loadingCatalog" class="no-providers">Loading models…</div>

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
            class="show-more-btn"
            @click="showMore"
          >
            Show more ({{ hiddenCount }} more)
          </button>

          <div v-if="visibleModels.length === 0 && visibleFavorites.length === 0" class="no-providers">
            No models match "{{ query }}"
          </div>
        </template>
      </div>
    </div>
  </Motion>
</template>

<script setup>
import { ref, watch } from 'vue';
import { Motion } from 'motion-v';
import { EASE, FILL } from '~/composables/motionPresets';
import { Icon } from '@iconify/vue';
import ModelPickerRow from './ModelPickerRow.vue';
import { useModelPicker } from '../composables/useModelPicker';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  selectedModelId: {
    type: String,
    default: ''
  },
  selectedModelName: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'model-selected']);

const isClosing = ref(false);

// Shared picker logic (search, pagination, favorites, provider switching)
const picker = useModelPicker();
const {
  // state
  query,
  loadingCatalog,
  providers,
  activeProviderId,
  allModels,
  visibleModels,
  hiddenCount,
  visibleFavorites,
  // actions
  selectModel: pickModel,
  toggleFavorite,
  isFavorite,
  showMore,
  resetForOpen,
  ensureCatalogLoaded,
  switchProvider,
} = picker;

// Watch for changes in isOpen to reset the state when opening
watch(() => props.isOpen, async (newIsOpen) => {
  if (newIsOpen) {
    resetForOpen();
    isClosing.value = false;
    await ensureCatalogLoaded();
  }
});

const onSelect = (modelId) => {
  const model = allModels.value.find((m) => m.id === modelId);
  pickModel(modelId);
  emit('model-selected', modelId, model?.name || '');
  emit('close');
};

/**
 * Tapping a provider tab makes it the ACTIVE provider and swaps the model
 * list (switchProvider is a no-op when it's already active).
 */
const onProviderTap = (provider) => {
  switchProvider(provider.id);
};

// Function to animate closing when backdrop is clicked
const closeSheet = () => {
  isClosing.value = true;
};

// Handle animation completion
const onAnimationComplete = () => {
  if (isClosing.value) {
    // Only emit close after animation is complete
    emit('close');
    isClosing.value = false;
  }
};
</script>

<style scoped>
.bottom-sheet-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2001;
  background: var(--bg-primary);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  height: 75vh;
  display: flex;
  flex-direction: column;
}

.backdrop {
  position: fixed;
  inset: 0;
  background: black;
  z-index: 2000;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.sheet-grabber {
  flex-shrink: 0;
  width: 44px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  margin: 10px auto 4px;
}

.sheet-header {
  flex-shrink: 0;
}

.header-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  text-align: center;
  padding: 4px 16px 8px;
}

/* --- Provider tabs --- */
.provider-tabs {
  display: flex;
  gap: 6px;
  padding: 6px 12px 10px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.provider-tabs::-webkit-scrollbar {
  display: none;
}

.provider-tab {
  flex-shrink: 0;
  min-height: 40px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.88rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.provider-tab:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.provider-tab.active {
  border-color: var(--primary);
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  font-weight: 600;
}

/* --- Model list body --- */
.models-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 0 16px;
}

.no-providers {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
}

/* --- Model search box (mobile) --- */
.model-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 16px 10px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  background: var(--bg-input, var(--bg-secondary));
}

.model-search-box:focus-within {
  border-color: var(--primary);
}

.model-search-box .search-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.model-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 11px 0;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.model-search-input::placeholder {
  color: var(--text-placeholder, var(--text-muted));
}

.mp-section-label {
  padding: 10px 16px 4px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  user-select: none;
}

.mp-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 16px;
}

.show-more-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 10px auto;
  padding: 12px;
  border-radius: var(--radius-md, 10px);
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.88rem;
  cursor: pointer;
}

.show-more-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
}
</style>
