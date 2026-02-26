<template>
  <PopoverRoot v-model:open="isOpen">
    <PopoverTrigger as-child>
      <button class="model-selector-trigger">
        <Logo v-if="providerLogo" :src="providerLogo" :size="18" />
        <span class="trigger-model-name">{{ selectedModelName || 'Select model' }}</span>
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="popover-content" side="top" :side-offset="8" align="start">
        <div class="search-area">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="Search models..."
          />
        </div>
        <div class="models-scroll">
          <div
            v-for="group in filteredGroups"
            :key="group.provider"
            class="provider-group"
          >
            <div class="provider-header">
              <Logo v-if="group.logo" :src="group.logo" :size="16" />
              <span>{{ group.name }}</span>
            </div>
            <div
              v-for="model in group.models"
              :key="model.id"
              class="model-item"
              :class="{ selected: model.id === selectedModelId }"
              @click="selectModel(model.id, model.name)"
            >
              <div class="model-item-info">
                <span class="model-name">{{ model.name }}</span>
                <span v-if="model.description" class="model-description">{{ model.description }}</span>
              </div>
              <Icon
                v-if="model.id === selectedModelId"
                icon="material-symbols:check-rounded"
                :width="18"
                class="model-check"
              />
            </div>
          </div>
          <div v-if="filteredGroups.length === 0" class="no-results">
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

.popover-content {
  background: var(--popover-bg);
  border: 1px solid var(--popover-border);
  border-radius: 12px;
  box-shadow: var(--popover-shadow);
  width: 340px;
  max-height: 420px;
  padding: 0;
  z-index: 1100;
  animation: popIn 0.2s ease-out forwards;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-area {
  padding: 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  font-size: 0.85rem;
  color: var(--text-primary);
  outline: none;
  box-sizing: border-box;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.models-scroll {
  overflow-y: auto;
  max-height: 360px;
  padding: 4px 0;
}

.provider-group {
  /* no extra spacing needed */
}

.provider-header {
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

.model-item {
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 4px;
  transition: background 0.15s ease;
}

.model-item:hover {
  background: var(--btn-hover);
}

.model-item.selected {
  background: var(--btn-hover-2, var(--btn-hover));
}

.model-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.model-name {
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--text-primary);
}

.model-description {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-check {
  color: var(--primary);
  flex-shrink: 0;
  margin-left: 8px;
}

.no-results {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

@keyframes popIn {
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
