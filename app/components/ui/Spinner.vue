<template>
  <span
    class="ui-spinner"
    :style="{ width: `${size}px`, height: `${size}px`, borderWidth: `${stroke}px` }"
    role="status"
    :aria-label="label"
  />
</template>

<script setup>
defineProps({
  size: { type: Number, default: 16 },
  stroke: { type: Number, default: 2 },
  label: { type: String, default: "Loading" },
});
</script>

<style scoped>
.ui-spinner {
  display: inline-block;
  border-style: solid;
  border-color: currentColor;
  border-top-color: transparent;
  border-radius: var(--radius-full);
  animation: uSpin 0.7s linear infinite;
  opacity: 0.85;
}

@media (prefers-reduced-motion: reduce) {
  .ui-spinner {
    animation-duration: 1.6s;
  }
}
</style>
