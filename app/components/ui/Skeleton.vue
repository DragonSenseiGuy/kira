<template>
  <span
    class="ui-skeleton u-shimmer"
    :style="{ width, height, borderRadius: radius }"
    aria-hidden="true"
  />
</template>

<script setup>
defineProps({
  width: { type: String, default: "100%" },
  height: { type: String, default: "12px" },
  radius: { type: String, default: "var(--radius-chip)" },
});
</script>

<style scoped>
.ui-skeleton {
  display: block;
}
</style>
