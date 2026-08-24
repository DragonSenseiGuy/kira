<template>
  <Motion
    v-if="isOpen"
    :initial="{ opacity: 0 }"
    :animate="isClosing ? { opacity: 0} : { opacity: 0.5}"
    :exit="{ opacity: 0 }"
    :transition="{ duration: 0.3, ease: 'easeOut' }"
    class="backdrop"
    @click="closeSheet"
  ></Motion>

  <Motion
    v-if="isOpen"
    :initial="{ y: '100%', opacity: 1 }"
    :animate="isClosing ? { y: '100%'} : { y: '0%'}"
    :exit="{ y: '100%', opacity: 0 }"
    :transition="{ type: 'spring', stiffness: 300, damping: 25, mass: 0.4 }"
    :on-animation-complete="onAnimationComplete"
    class="bottom-sheet-container"
    @click.stop
  >

    <!-- Sheet header and content with sliding effect -->
    <div class="content-wrapper">
      <!-- Sheet header -->
      <div class="sheet-header">
        <div class="nav-content">
          <div class="nav-side">
            <button v-if="currentView === 'models'" class="nav-button" @click="goBackToProviders" aria-label="Go back">
              <Icon icon="material-symbols:arrow-back-ios-new" width="20" height="20" />
            </button>
            <div v-else class="nav-placeholder"></div>
          </div>
          <h2 class="header-text">
            <template v-if="currentView === 'models'">
              {{ activeProviderName }}
            </template>
            <template v-else>
              Choose a model
            </template>
          </h2>
          <div class="nav-side">
            <!-- Right side placeholder for alignment -->
          </div>
        </div>
      </div>

      <!-- Content container -->
      <div class="content-container">
        <!-- Providers page: one entry per configured provider -->
        <Motion
          :initial="firstOpen && currentView === 'providers' ? { x: 0 } : (currentView === 'providers' ? { x: 0 } : { x: '-100%' })"
          :animate="currentView === 'providers' ? { x: 0 } : { x: '-100%' }"
          :transition="{ type: 'spring', stiffness: 300, damping: 25 }"
          class="providers-page"
        >
          <div v-if="providers.length === 0" class="no-providers">
            No providers found
          </div>
          <div
            v-for="provider in providers"
            :key="provider.id"
            class="provider-item"
            :class="{ 'active-provider': provider.id === activeProviderId }"
            @click="onProviderTap(provider)"
          >
            <span class="provider-name">{{ provider.name }}</span>
            <span v-if="provider.id === activeProviderId" class="active-provider-badge">Active</span>
            <Icon icon="material-symbols:chevron-right" width="20" height="20" class="chevron-icon" />
          </div>
        </Motion>

        <!-- Models page: searchable list of the active provider's models -->
        <Motion
          :initial="firstOpen && currentView === 'models' ? { x: 0 } : (currentView === 'models' ? { x: 0 } : { x: '100%' })"
          :animate="currentView === 'models' ? { x: 0 } : { x: '100%' }"
          :transition="{ type: 'spring', stiffness: 300, damping: 25 }"
          class="models-page"
        >
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
        </Motion>
      </div>
    </div> <!-- Close content-wrapper div -->
  </Motion> <!-- Close main sheet container Motion -->
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { Motion } from 'motion-v';
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

// Navigation state
const currentView = ref('providers'); // 'providers' or 'models'
const selectedProvider = ref(null);
// State for tracking if this is the first time opening (not just initial render)
let firstOpen = true;

// Shared picker logic (search, pagination, favorites, provider switching)
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
  selectModel: pickModel,
  toggleFavorite,
  isFavorite,
  showMore,
  resetForOpen,
  ensureCatalogLoaded,
} = picker;

const activeProviderName = computed(
  () => providers.value.find((p) => p.id === activeProviderId.value)?.name || 'Models',
);

// Watch for changes in isOpen to reset the state when opening
watch(() => props.isOpen, async (newIsOpen) => {
  if (newIsOpen) {
    // Reset states when opening
    currentView.value = 'providers';
    selectedProvider.value = null;
    resetForOpen();
    isClosing.value = false;
    firstOpen = false;
    await ensureCatalogLoaded();
  } else {
    // When closing, reset firstOpen for the next time it opens
    firstOpen = true;
  }
});

const onSelect = (modelId) => {
  const model = allModels.value.find((m) => m.id === modelId);
  pickModel(modelId);
  emit('model-selected', modelId, model?.name || '');
  emit('close');
};

/**
 * Tapping a provider makes it the ACTIVE provider, then shows its
 * searchable model list.
 */
const onProviderTap = async (provider) => {
  await picker.switchProvider(provider.id);
  currentView.value = 'models';
};

const goBackToProviders = () => {
  currentView.value = 'providers';
  // Reset the selected provider when going back
  selectedProvider.value = null;
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

.sheet-header {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
}

.nav-side {
  width: 40px;
  display: flex;
}

.nav-button {
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  padding: 8px;
  margin-left: -8px;
  display: flex;
  align-items: center;
}

.header-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  text-align: center;
  flex: 1;
}

.content-container {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.providers-page,
.models-page {
  position: absolute;
  inset: 0;
  overflow-y: auto;
}

.models-page {
  padding: 8px 0 16px;
}

.no-providers {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-secondary);
}

.provider-item {
  display: flex;
  align-items: center;
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s;
  gap: 12px;
}

.provider-item:hover {
  background: var(--btn-hover);
}

.provider-item.active-provider {
  border-left: 3px solid var(--primary);
}

.active-provider-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.provider-name {
  flex-grow: 1;
  font-weight: 500;
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
