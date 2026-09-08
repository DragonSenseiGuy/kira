<template>
  <button
    class="ui-icon-btn u-press"
    :class="[`ui-icon-btn--${variant}`, `ui-icon-btn--${size}`, { 'is-active': active }]"
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="togglable ? String(active) : undefined"
  >
    <slot>
      <Icon :icon="icon" :width="glyphSize" :height="glyphSize" />
    </slot>
  </button>
</template>

<script setup>
import { computed } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps({
  icon: { type: String, default: "" },
  /** Required — icon-only controls have no visible text to announce. */
  label: { type: String, required: true },
  variant: {
    type: String,
    default: "ghost",
    validator: (v) => ["ghost", "subtle", "solid", "danger"].includes(v),
  },
  size: {
    type: String,
    default: "md",
    validator: (v) => ["sm", "md", "lg"].includes(v),
  },
  /** Persistent on/off appearance, e.g. a filter that stays enabled. */
  active: { type: Boolean, default: false },
  togglable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const glyphSize = computed(() => (props.size === "sm" ? 16 : props.size === "lg" ? 22 : 20));
</script>

<style scoped>
.ui-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.ui-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ui-icon-btn--sm {
  width: 28px;
  height: 28px;
}

.ui-icon-btn--md {
  width: 34px;
  height: 34px;
}

.ui-icon-btn--lg {
  width: 40px;
  height: 40px;
}

.ui-icon-btn--ghost:hover:not(:disabled) {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.ui-icon-btn--subtle {
  background: var(--field);
  color: var(--text-primary);
}

.ui-icon-btn--subtle:hover:not(:disabled) {
  background: var(--hover-2);
}

.ui-icon-btn--solid {
  background: var(--action);
  color: var(--action-on);
  box-shadow: none;
}

.ui-icon-btn--solid:hover:not(:disabled) {
  background: var(--action-hover);
}

.ui-icon-btn--danger:hover:not(:disabled) {
  background: var(--red-tint);
  color: var(--danger);
}

.ui-icon-btn.is-active {
  background: var(--hover-2);
  color: var(--text-primary);
}
</style>
