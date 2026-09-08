<template>
  <component
    :is="as"
    class="ui-btn u-press"
    :class="[`ui-btn--${variant}`, `ui-btn--${size}`, { 'ui-btn--block': block, 'ui-btn--busy': loading }]"
    :type="as === 'button' ? type : undefined"
    :disabled="as === 'button' ? disabled || loading : undefined"
    :aria-busy="loading || undefined"
    :aria-disabled="as !== 'button' && (disabled || loading) ? 'true' : undefined"
  >
    <!-- The label keeps its box while busy so the button never resizes
         mid-request; the spinner is overlaid on top of it. -->
    <span class="ui-btn__body">
      <Icon v-if="icon" :icon="icon" class="ui-btn__icon" :width="iconSize" :height="iconSize" />
      <slot />
      <Icon v-if="trailingIcon" :icon="trailingIcon" class="ui-btn__icon" :width="iconSize" :height="iconSize" />
    </span>
    <span v-if="loading" class="ui-btn__spinner" aria-hidden="true">
      <UiSpinner :size="iconSize" />
    </span>
  </component>
</template>

<script setup>
import { computed } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps({
  /** Visual weight. `primary` is the single accent action per surface. */
  variant: {
    type: String,
    default: "secondary",
    validator: (v) => ["primary", "secondary", "ghost", "subtle", "danger"].includes(v),
  },
  size: {
    type: String,
    default: "md",
    validator: (v) => ["sm", "md", "lg"].includes(v),
  },
  /** Element to render — `button` by default, `a`/`NuxtLink` for navigation. */
  as: { type: [String, Object], default: "button" },
  type: { type: String, default: "button" },
  icon: { type: String, default: "" },
  trailingIcon: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  /** Swaps the label for a spinner without changing the button's size. */
  loading: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
});

const iconSize = computed(() => (props.size === "sm" ? 14 : props.size === "lg" ? 18 : 16));
</script>

<style scoped>
.ui-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: inherit;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  border: none;
  /* ChatGPT's controls are pills — the radius tracks the height rather than
     a fixed corner, so sm/md/lg all read as the same family. */
  border-radius: var(--radius-full);
  cursor: pointer;
  user-select: none;
  text-decoration: none;
}

.ui-btn:disabled,
.ui-btn[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.55;
}

.ui-btn__body {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.ui-btn--busy .ui-btn__body {
  opacity: 0;
}

.ui-btn__spinner {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.ui-btn__icon {
  flex-shrink: 0;
}

/* ---------- Sizes ---------- */
.ui-btn--sm {
  height: 30px;
  padding: 0 12px;
  font-size: 0.8rem;
}

.ui-btn--md {
  height: 36px;
  padding: 0 14px;
  font-size: 0.875rem;
}

.ui-btn--lg {
  height: 44px;
  padding: 0 20px;
  font-size: 0.9375rem;
}

.ui-btn--block {
  width: 100%;
}

/* ---------- Variants ----------
   Primary is the neutral action pill (black on light, white on dark), the
   way ChatGPT treats its commit buttons. The accent is left for links. */
.ui-btn--primary {
  background: var(--action);
  color: var(--action-on);
  box-shadow: none;
}

.ui-btn--primary:hover:not(:disabled) {
  background: var(--action-hover);
}

.ui-btn--secondary {
  background: transparent;
  color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--line-strong);
}

.ui-btn--secondary:hover:not(:disabled) {
  background: var(--btn-hover);
}

.ui-btn--ghost {
  background: transparent;
  color: var(--text-secondary);
}

.ui-btn--ghost:hover:not(:disabled) {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.ui-btn--subtle {
  background: var(--field);
  color: var(--text-primary);
}

.ui-btn--subtle:hover:not(:disabled) {
  background: var(--hover-2);
}

.ui-btn--danger {
  background: var(--danger);
  color: var(--destructive-foreground);
  box-shadow: var(--shadow-btn);
}

.ui-btn--danger:hover:not(:disabled) {
  background: var(--destructive-600);
}
</style>
