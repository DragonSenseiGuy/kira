<template>
  <div class="ui-switch-row">
    <div v-if="label || description" class="ui-switch-row__text">
      <span class="ui-switch-row__label">{{ label }}</span>
      <span v-if="description" class="ui-switch-row__desc">{{ description }}</span>
    </div>
    <SwitchRoot
      class="ui-switch"
      :model-value="modelValue"
      :disabled="disabled"
      :aria-label="label || ariaLabel"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <SwitchThumb class="ui-switch__thumb" />
    </SwitchRoot>
  </div>
</template>

<script setup>
import { SwitchRoot, SwitchThumb } from "reka-ui";

defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: "" },
  description: { type: String, default: "" },
  ariaLabel: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

defineEmits(["update:modelValue"]);
</script>

<style scoped>
.ui-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ui-switch-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ui-switch-row__label {
  font-size: 0.85rem;
  color: var(--text-primary);
}

.ui-switch-row__desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.ui-switch {
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: var(--radius-full);
  background: var(--line-strong);
  cursor: pointer;
  transition: background-color var(--duration) var(--ease-out);
}

.ui-switch[data-state="checked"] {
  background: var(--action);
}

.ui-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-switch__thumb {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  /* Tracks the action token so the thumb stays visible once the checked
     track goes white in dark mode. */
  background: var(--action-on);
  box-shadow: 0 1px 2px #0000002e;
  transform: translateX(2px);
  transition: transform var(--duration) var(--ease-out-strong);
  will-change: transform;
}

.ui-switch__thumb[data-state="checked"] {
  transform: translateX(18px);
}
</style>
