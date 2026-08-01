<template>
  <span class="ui-badge" :class="[`ui-badge--${tone}`, { 'ui-badge--dot': showDot }]">
    <span v-if="showDot" class="ui-badge__dot" :class="{ 'is-live': live }" aria-hidden="true" />
    <Icon v-else-if="icon" :icon="icon" width="12" height="12" />
    <slot />
  </span>
</template>

<script setup>
import { Icon } from "@iconify/vue";

defineProps({
  tone: {
    type: String,
    default: "neutral",
    validator: (v) => ["neutral", "accent", "success", "warning", "danger"].includes(v),
  },
  icon: { type: String, default: "" },
  showDot: { type: Boolean, default: false },
  /** Pulses the dot — for states that are still in flight. */
  live: { type: Boolean, default: false },
});
</script>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.5;
  white-space: nowrap;
  border-radius: var(--radius-full);
}

.ui-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
  flex-shrink: 0;
}

.ui-badge__dot.is-live {
  animation: uPulse 1.4s var(--ease-in-out) infinite;
}

.ui-badge--neutral {
  color: var(--text-secondary);
  background: var(--field);
}

.ui-badge--accent {
  color: var(--accent-ink);
  background: var(--accent-tint);
}

.ui-badge--success {
  color: var(--success);
  background: var(--green-tint);
}

.ui-badge--warning {
  color: var(--warning);
  background: var(--orange-tint);
}

.ui-badge--danger {
  color: var(--danger);
  background: var(--red-tint);
}
</style>
