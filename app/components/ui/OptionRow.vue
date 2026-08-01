<template>
  <label class="ui-option" :class="{ 'is-disabled': disabled, 'is-checked': modelValue }">
    <CheckboxRoot
      class="ui-option__box"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <CheckboxIndicator class="ui-option__tick">
        <Icon icon="material-symbols:check-rounded" width="14" height="14" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <span class="ui-option__text">
      <span class="ui-option__label">{{ label }}</span>
      <span v-if="hint" class="ui-option__hint">{{ hint }}</span>
    </span>
  </label>
</template>

<script setup>
import { CheckboxRoot, CheckboxIndicator } from "reka-ui";
import { Icon } from "@iconify/vue";

defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  hint: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

defineEmits(["update:modelValue"]);
</script>

<style scoped>
.ui-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--inset);
  border-radius: var(--radius-control);
  box-shadow: var(--shadow-hairline);
  cursor: pointer;
  transition: box-shadow var(--duration-fast) var(--ease-out);
}

.ui-option:hover:not(.is-disabled) {
  box-shadow: 0 0 0 1px var(--line-strong);
}

.ui-option.is-checked {
  box-shadow: 0 0 0 1px var(--accent);
}

.ui-option.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ui-option__box {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  padding: 0;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-chip);
  background: var(--card);
  box-shadow: 0 0 0 1px var(--line-strong);
  color: var(--accent-on);
  cursor: inherit;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.ui-option__box[data-state="checked"] {
  background: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.ui-option__tick {
  display: grid;
  place-items: center;
  animation: uPop var(--duration-fast) var(--ease-out-strong) both;
}

.ui-option__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ui-option__label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.ui-option__hint {
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-secondary);
}

@keyframes uPop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
