<template>
  <div class="ui-segmented" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="ui-segmented__option u-press"
      :class="{ 'is-selected': option.value === modelValue }"
      :aria-checked="option.value === modelValue"
      :disabled="option.disabled"
      @click="$emit('update:modelValue', option.value)"
    >
      <Icon v-if="option.icon" :icon="option.icon" width="15" height="15" />
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { Icon } from "@iconify/vue";

defineProps({
  modelValue: { type: [String, Number], default: "" },
  /** `[{ value, label, icon?, disabled? }]` */
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: "" },
});

defineEmits(["update:modelValue"]);
</script>

<style scoped>
.ui-segmented {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--field);
  border-radius: var(--radius-control);
}

.ui-segmented__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-chip);
  cursor: pointer;
  white-space: nowrap;
}

.ui-segmented__option:hover:not(:disabled):not(.is-selected) {
  color: var(--text-primary);
}

.ui-segmented__option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Selected reads as a raised chip lifted out of the recessed track */
.ui-segmented__option.is-selected {
  color: var(--text-primary);
  background: var(--card);
  box-shadow: var(--shadow-btn);
}
</style>
