<template>
  <PopoverRoot v-model:open="isOpen">
    <PopoverTrigger class="model-selector-trigger">
      <Logo v-if="providerLogo" :src="providerLogo" :size="18" />
      <span class="trigger-model-name">{{ selectedModelName || 'Select model' }}</span>
      <Icon icon="material-symbols:keyboard-arrow-down-rounded" :width="18" class="trigger-chevron" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="model-popover-content" side="top" :side-offset="8" align="start">
        <div class="model-popover-search-area">
          <input
            v-model="searchQuery"
            type="text"
            class="model-popover-search-input"
            placeholder="Search models..."
          />
        </div>
        <div class="model-popover-scroll">
          <div
            v-for="group in filteredGroups"
            :key="group.provider"
            class="model-popover-group"
          >
            <div class="model-popover-provider-header">
              <Logo v-if="group.logo" :src="group.logo" :size="16" />
              <span>{{ group.name }}</span>
            </div>
            <div
              v-for="model in group.models"
              :key="model.id"
              class="model-popover-item"
              :class="{ selected: model.id === selectedModelId }"
              @click="selectModel(model.id, model.name)"
            >
              <div class="model-popover-item-info">
                <span class="model-popover-model-name">{{ model.name }}</span>
                <span v-if="model.description" class="model-popover-description">{{ model.description }}</span>
              </div>
              <Icon
                v-if="model.id === selectedModelId"
                icon="material-symbols:check-rounded"
                :width="18"
                class="model-popover-check"
              />
            </div>
          </div>
          <div v-if="filteredGroups.length === 0" class="model-popover-no-results">
            No models found
          </div>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { PopoverRoot, PopoverTrigger, PopoverContent, PopoverPortal } from 'reka-ui';
import { Icon } from '@iconify/vue';
import { useModels } from '~/composables/useModels';
import Logo from './Logo.vue';

const props = defineProps({
  selectedModelId: String,
  selectedModelName: String,
});

const emit = defineEmits(['model-selected']);

const { groupedModels, isLoading, fetchModels, getProviderLogo } = useModels();

const isOpen = ref(false);
const searchQuery = ref('');

onMounted(() => {
  if (groupedModels.value.length === 0) {
    fetchModels();
  }
});

const providerLogo = computed(() => {
  if (!props.selectedModelId) return null;
  return getProviderLogo(props.selectedModelId);
});

const filteredGroups = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return groupedModels.value;

  return groupedModels.value
    .map(group => {
      const nameMatch = group.name.toLowerCase().includes(query);
      const matchingModels = group.models.filter(
        model =>
          nameMatch ||
          model.name.toLowerCase().includes(query) ||
          (model.description && model.description.toLowerCase().includes(query))
      );
      if (matchingModels.length === 0) return null;
      return { ...group, models: matchingModels };
    })
    .filter(Boolean);
});

const selectModel = (modelId, modelName) => {
  emit('model-selected', modelId, modelName);
  isOpen.value = false;
  searchQuery.value = '';
};
</script>

<style scoped>
.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  height: 36px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s ease;
}

.model-selector-trigger:hover {
  background: var(--btn-hover);
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
  transition: transform 0.2s ease;
}

.model-selector-trigger[data-state="open"] .trigger-chevron {
  transform: rotate(180deg);
}
</style>

<!-- Unscoped styles for portal-teleported popover content -->
<style>
.model-popover-content {
  background: var(--popover-bg);
  border: 1px solid var(--popover-border);
  border-radius: 12px;
  box-shadow: var(--popover-shadow);
  width: 340px;
  max-height: 420px;
  padding: 0;
  z-index: 1100;
  animation: modelPopoverIn 0.2s ease-out forwards;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 4px;
  transition: background 0.15s ease;
}

.model-popover-item:hover {
  background: var(--btn-hover);
}

.model-popover-item.selected {
  background: var(--btn-hover-2, var(--btn-hover));
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
  color: var(--primary);
  flex-shrink: 0;
  margin-left: 8px;
}

.model-popover-no-results {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

@keyframes modelPopoverIn {
  0% {
    opacity: 0;
    transform: scale(0.95) translateY(-5px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
