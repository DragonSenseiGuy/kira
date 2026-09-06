<template>
  <PopoverRoot v-model:open="isOpen">
    <PopoverTrigger class="model-selector-trigger">
      <Logo :src="null" :label="selectedModelName" :size="18" />
      <span class="trigger-model-name">{{ selectedModelName || 'Select model' }}</span>
      <Icon icon="material-symbols:keyboard-arrow-down-rounded" :width="18" class="trigger-chevron" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="model-popover-content" side="top" :side-offset="8" align="start">
        <!-- Provider chips: Hack Club plus any custom OpenAI-compatible
             providers the user configured in Settings. -->
        <div v-if="providers.length > 1" class="model-popover-providers">
          <button
            v-for="provider in providers"
            :key="provider.id"
            type="button"
            class="model-popover-provider-chip"
            :class="{ active: provider.id === activeProviderId }"
            @click="switchProvider(provider.id)"
          >
            {{ provider.name }}
          </button>
        </div>

        <div class="model-popover-search-area">
          <input
            v-model="query"
            type="text"
            class="model-popover-search-input"
            placeholder="Search models..."
          />
        </div>

        <div class="model-popover-scroll">
          <div v-if="loadingCatalog && !allModels.length" class="model-popover-no-results">
            Loading models…
          </div>

          <template v-else>
            <div v-if="visibleFavorites.length" class="model-popover-group">
              <div class="model-popover-provider-header">
                <span>Favorites</span>
              </div>
              <ModelPickerRow
                v-for="model in visibleFavorites"
                :key="`fav-${model.id}`"
                :model="model"
                :selected="model.id === selectedModelId"
                :favorite="true"
                @select="choose(model)"
                @toggle-favorite="toggleFavorite(model.id)"
              />
            </div>

            <ModelPickerRow
              v-for="model in visibleModels"
              :key="model.id"
              :model="model"
              :selected="model.id === selectedModelId"
              :favorite="isFavorite(model.id)"
              @select="choose(model)"
              @toggle-favorite="toggleFavorite(model.id)"
            />

            <button v-if="hiddenCount > 0" type="button" class="model-popover-more" @click="showMore">
              Show {{ Math.min(hiddenCount, MODEL_PAGE_SIZE) }} more ({{ hiddenCount }} left)
            </button>

            <div v-if="!visibleModels.length && !visibleFavorites.length" class="model-popover-no-results">
              No models found
            </div>
          </template>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup>
import { ref, watch } from 'vue';
import { PopoverRoot, PopoverTrigger, PopoverContent, PopoverPortal } from 'reka-ui';
import { Icon } from '@iconify/vue';
import { useModelPicker, MODEL_PAGE_SIZE } from '~/composables/useModelPicker';
import ModelPickerRow from './ModelPickerRow.vue';
import Logo from './Logo.vue';

const props = defineProps({
  selectedModelId: String,
  selectedModelName: String,
});

const emit = defineEmits(['model-selected']);

// Shared picker state, so this popover and the mobile bottom sheet stay
// in lockstep on providers, favorites and pagination.
const {
  query,
  loadingCatalog,
  providers,
  activeProviderId,
  allModels,
  visibleModels,
  visibleFavorites,
  hiddenCount,
  resetForOpen,
  showMore,
  ensureCatalogLoaded,
  selectModel,
  switchProvider,
  toggleFavorite,
  isFavorite,
} = useModelPicker();

const isOpen = ref(false);

// The catalog is ~840 models, so it is fetched on first open rather than
// at import time — an unopened picker costs nothing.
watch(isOpen, (open) => {
  if (!open) return;
  resetForOpen();
  ensureCatalogLoaded();
});

function choose(model) {
  selectModel(model.id);
  emit('model-selected', model.id, model.name);
  isOpen.value = false;
}
</script>

<style scoped>
/* Matches UiButton --secondary at size md, so it sits level with the
   composer's other controls. */
.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: var(--radius-control);
  padding: 0 10px;
  height: 32px;
  background: var(--card);
  box-shadow: var(--shadow-btn);
  color: var(--text-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out-strong);
}

.model-selector-trigger:hover {
  background: var(--hover);
}

.model-selector-trigger:active {
  transform: scale(var(--press-scale));
}

.trigger-model-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.trigger-chevron {
  flex-shrink: 0;
  opacity: 0.6;
  transition: transform var(--duration) var(--ease-out-strong);
}

.model-selector-trigger[data-state="open"] .trigger-chevron {
  transform: rotate(180deg);
}
</style>

<!-- Unscoped styles for portal-teleported popover content -->
<style>
.model-popover-content {
  background: var(--popover-bg);
  border-radius: var(--radius-xl);
  box-shadow: var(--popover-shadow);
  width: 340px;
  max-height: 420px;
  padding: 0;
  z-index: 1100;
  animation: popIn var(--duration-enter) var(--ease-out-strong) forwards;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.model-popover-providers {
  display: flex;
  gap: 4px;
  padding: 6px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  scrollbar-width: none;
}

.model-popover-providers::-webkit-scrollbar {
  display: none;
}

.model-popover-provider-chip {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 500;
  white-space: nowrap;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.model-popover-provider-chip:hover {
  background: var(--btn-hover);
}

.model-popover-provider-chip.active {
  background: var(--popover-list-item-selected-bg);
  color: var(--popover-list-item-selected-text);
}

.model-popover-more {
  display: block;
  width: calc(100% - 8px);
  margin: 4px;
  padding: 8px;
  border-radius: var(--radius-chip);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.model-popover-more:hover {
  background: var(--btn-hover);
}

.model-popover-search-area {
  padding: 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.model-popover-search-input {
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  font-size: 0.85rem;
  color: var(--text-primary);
  outline: none;
  box-sizing: border-box;
}

.model-popover-search-input::placeholder {
  color: var(--text-muted);
}

.model-popover-scroll {
  overflow-y: auto;
  max-height: 360px;
  padding: 4px 0;
}

.model-popover-provider-header {
  padding: 8px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-popover-item {
  padding: 6px 9px;
  border-radius: var(--radius-chip);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 4px;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.model-popover-item:hover {
  background: var(--btn-hover);
}

.model-popover-item.selected {
  background: var(--popover-list-item-selected-bg);
}

.model-popover-item.selected .model-popover-model-name {
  color: var(--popover-list-item-selected-text);
}

.model-popover-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.model-popover-model-name {
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--text-primary);
}

.model-popover-description {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-popover-check {
  color: var(--text-primary);
  flex-shrink: 0;
  margin-left: 8px;
}

.model-popover-no-results {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
