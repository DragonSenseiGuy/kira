<template>
  <div class="ui-disclosure" :class="{ 'is-open': open }">
    <button
      class="ui-disclosure__trigger"
      type="button"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="toggle"
    >
      <slot name="trigger" :open="open" />
      <Icon
        v-if="chevron"
        icon="material-symbols:keyboard-arrow-down-rounded"
        class="ui-disclosure__chevron"
        width="18"
        height="18"
      />
    </button>

    <!-- Height animates between 0 and auto via `interpolate-size`, so the
         panel can grow while open (reasoning streams in) without pinning a
         max-height or measuring in JS. Browsers without `interpolate-size`
         simply snap open. The panel stays rendered while collapsed; `inert`
         keeps it out of focus order and the a11y tree. -->
    <div :id="panelId" class="ui-disclosure__panel">
      <div class="ui-disclosure__inner" :inert="!open || undefined">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, useId } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps({
  /** Controlled open state. Omit to let the component own it. */
  modelValue: { type: Boolean, default: undefined },
  defaultOpen: { type: Boolean, default: false },
  chevron: { type: Boolean, default: true },
});

const emit = defineEmits(["update:modelValue"]);

const panelId = `disclosure-${useId()}`;
const internalOpen = ref(props.defaultOpen);

const open = computed(() =>
  props.modelValue === undefined ? internalOpen.value : props.modelValue,
);

function toggle() {
  const next = !open.value;
  internalOpen.value = next;
  emit("update:modelValue", next);
}
</script>

<style scoped>
.ui-disclosure__trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0;
  font: inherit;
  text-align: left;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

.ui-disclosure__chevron {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--text-muted);
  transition: transform var(--duration) var(--ease-out-strong);
}

.is-open .ui-disclosure__chevron {
  transform: rotate(180deg);
}

.ui-disclosure__panel {
  height: 0;
  overflow: hidden;
  transition: height var(--duration-slow) var(--ease-out-strong);
}

.is-open .ui-disclosure__panel {
  height: auto;
}

@media (prefers-reduced-motion: reduce) {
  .ui-disclosure__panel {
    transition: none;
  }
}
</style>
