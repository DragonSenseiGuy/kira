<template>
  <span class="ui-reasoning" role="status" aria-live="polite">
    <slot name="indicator">
      <span class="ui-reasoning__glyph" aria-hidden="true">{{ glyph }}</span>
    </slot>

    <UiAgentThinkingShimmer :duration="shimmerDuration" class="ui-reasoning__text">
      <span :key="index" class="ui-reasoning__phrase">
        <span
          v-for="(word, i) in words"
          :key="`${index}-${i}`"
          class="ui-reasoning__word"
          :style="{ animationDelay: `${i * 45}ms` }"
          >{{ word }}</span
        >
      </span>
    </UiAgentThinkingShimmer>
  </span>
</template>

<script setup>
/**
 * Shimmering reasoning copy that cycles through phrases, ported from beUI's
 * `reasoning-text`. Each new phrase rises into place a word at a time.
 *
 * The phrases are decorative — the shimmer already tells the user work is in
 * flight — so under reduced motion the cycle keeps running for its
 * information value while every transform is dropped.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  /** Phrases cycled through while the agent works. */
  phrases: {
    type: Array,
    default: () => [
      "Thinking",
      "Reading the context",
      "Connecting the details",
      "Forming a response",
    ],
  },
  /** Milliseconds each phrase remains visible. */
  interval: { type: Number, default: 1800 },
  /** Seconds taken for one shimmer pass. */
  shimmerDuration: { type: Number, default: 2.2 },
});

const GLYPHS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const index = ref(0);
const glyph = ref(GLYPHS[0]);

const words = computed(() => (props.phrases[index.value] ?? "").split(" "));

function reducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// --- Phrase cycling ---

let cycleTimer = null;

function startCycle() {
  stopCycle();
  if (props.phrases.length < 2) return;
  cycleTimer = setInterval(() => {
    index.value = (index.value + 1) % props.phrases.length;
  }, props.interval);
}

function stopCycle() {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
}

// --- Glyph spinner ---

let glyphTimer = null;

if (!reducedMotion()) {
  let frame = 0;
  glyphTimer = setInterval(() => {
    frame = (frame + 1) % GLYPHS.length;
    glyph.value = GLYPHS[frame];
  }, 80);
}

watch(() => [props.phrases, props.interval], startCycle, { immediate: true });

onBeforeUnmount(() => {
  stopCycle();
  if (glyphTimer) clearInterval(glyphTimer);
});
</script>

<style scoped>
.ui-reasoning {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.9rem;
}

.ui-reasoning__glyph {
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--text-muted);
  /* The braille frames differ in width; a fixed box stops the copy jittering. */
  display: inline-block;
  width: 1ch;
  text-align: center;
}

.ui-reasoning__text {
  min-width: 0;
}

.ui-reasoning__word {
  display: inline-block;
  white-space: pre;
  animation: uiPhraseCascade var(--duration-slow) var(--ease-out-strong) backwards;
}

.ui-reasoning__word:not(:last-child)::after {
  content: " ";
}

@keyframes uiPhraseCascade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-reasoning__word {
    animation: none;
  }
}
</style>
