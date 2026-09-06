<template>
  <label class="ui-input" :class="{ 'ui-input--invalid': !!error }">
    <span v-if="label" class="ui-input__label">{{ label }}</span>
    <span class="ui-input__wrap">
      <Icon v-if="icon" :icon="icon" class="ui-input__icon" width="16" height="16" />
      <input
        v-bind="$attrs"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        class="ui-input__control"
        :class="{ 'has-icon': !!icon }"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <span v-if="suffix" class="ui-input__suffix">{{ suffix }}</span>
    </span>
    <span v-if="error || hint" class="ui-input__note" :class="{ 'is-error': !!error }">
      {{ error || hint }}
    </span>
  </label>
</template>

<script setup>
import { Icon } from "@iconify/vue";

defineOptions({ inheritAttrs: false });

defineProps({
  modelValue: { type: [String, Number], default: "" },
  type: { type: String, default: "text" },
  label: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  hint: { type: String, default: "" },
  /** Shown in place of the hint, and rings the field red. */
  error: { type: String, default: "" },
  icon: { type: String, default: "" },
  suffix: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

defineEmits(["update:modelValue"]);
</script>

<style scoped>
.ui-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.ui-input__label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.ui-input__wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.ui-input__icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.ui-input__control {
  width: 100%;
  font-family: inherit;
  font-size: 0.85rem;
  color: var(--text-primary);
  background: var(--field);
  border: none;
  border-radius: var(--radius-control);
  box-shadow: var(--shadow-hairline);
  padding: 8px 10px;
  transition: box-shadow var(--duration-fast) var(--ease-out);
}

.ui-input__control.has-icon {
  padding-left: 32px;
}

.ui-input__control:focus {
  outline: none;
  box-shadow: 0 0 0 1px var(--ink-3);
}

.ui-input__control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ui-input--invalid .ui-input__control {
  box-shadow: 0 0 0 1px var(--danger);
}

.ui-input__suffix {
  position: absolute;
  right: 10px;
  font-size: 0.75rem;
  color: var(--text-muted);
  pointer-events: none;
}

.ui-input__note {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.ui-input__note.is-error {
  color: var(--danger);
}
</style>
