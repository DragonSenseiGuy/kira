<template>
  <span class="ui-kbd" :class="`ui-kbd--${tone}`">
    <kbd v-for="cap in caps" :key="cap" class="ui-kbd__cap">{{ cap }}</kbd>
  </span>
</template>

<script setup>
import { computed } from "vue";
import { formatComboParts } from "~/utils/keybinds";

const props = defineProps({
  /** A combo string such as "mod+k" — rendered with platform glyphs. */
  keys: { type: String, required: true },
  tone: {
    type: String,
    default: "default",
    validator: (v) => ["default", "dark"].includes(v),
  },
});

const isMac = computed(
  () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
);

const caps = computed(() => formatComboParts(props.keys, isMac.value));
</script>

<style scoped>
.ui-kbd {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.ui-kbd__cap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  font-family: var(--font);
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1;
  border-radius: var(--radius-chip);
}

.ui-kbd--default .ui-kbd__cap {
  color: var(--text-secondary);
  background: var(--field);
  box-shadow: var(--shadow-hairline);
}

.ui-kbd--dark .ui-kbd__cap {
  color: var(--tooltip-muted);
  background: #ffffff14;
  box-shadow: 0 0 0 1px var(--tooltip-border);
}
</style>
