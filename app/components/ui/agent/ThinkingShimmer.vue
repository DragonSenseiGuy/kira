<template>
  <span
    class="ui-shimmer"
    :style="{ '--shimmer-duration': `${duration}s` }"
    role="status"
    aria-live="polite"
  >
    <slot>Thinking…</slot>
  </span>
</template>

<script setup>
/**
 * A quiet shimmer that keeps the agent's current status readable while work
 * continues. Ported from beUI's `thinking-shimmer` onto Kira's tokens: the
 * sweep runs between --text-muted and --text-primary so it reads as the same
 * copy brightening rather than as a separate animated element.
 */
defineProps({
  /** Seconds taken for one shimmer pass. */
  duration: { type: Number, default: 1.8 },
});
</script>

<style scoped>
.ui-shimmer {
  display: inline-block;
  color: var(--text-secondary);
  background-image: linear-gradient(
    100deg,
    var(--text-muted) 30%,
    var(--text-primary) 48%,
    var(--text-muted) 66%
  );
  background-size: 300% 100%;
  background-position: 150% 0;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: uiShimmerSweep var(--shimmer-duration, 1.8s) linear infinite;
}

@keyframes uiShimmerSweep {
  to {
    background-position: -150% 0;
  }
}

/* Without motion the gradient would sit frozen mid-sweep, so drop back to
   flat secondary text instead of a half-lit string. */
@media (prefers-reduced-motion: reduce) {
  .ui-shimmer {
    background-image: none;
    -webkit-text-fill-color: currentColor;
    animation: none;
  }
}
</style>
