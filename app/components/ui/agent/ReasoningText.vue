<template>
  <span class="ui-reasoning" role="status" aria-live="polite">
    <slot name="indicator">
      <span class="ui-reasoning__glyph" aria-hidden="true">{{ glyph }}</span>
    </slot>

    <UiAgentThinkingShimmer :duration="shimmerDuration" class="ui-reasoning__text">
      <span :key="index" class="ui-reasoning__phrase" :class="`is-${variant}`">
        <template v-if="variant === 'cascade'">
          <span
            v-for="(word, i) in words"
            :key="`${index}-${i}`"
            class="ui-reasoning__word"
            :style="{ animationDelay: `${i * 45}ms` }"
            >{{ word }}</span
          >
        </template>
        <template v-else>{{ displayed }}</template>
      </span>
    </UiAgentThinkingShimmer>
  </span>
</template>

<script setup>
/**
 * Shimmering reasoning copy that cycles through phrases, ported from beUI's
 * `reasoning-text`. Three transitions: `cascade` rises the new phrase in a
 * word at a time, `swap` blur-fades the whole line, and `scramble` resolves
 * it left to right out of random glyphs.
 *
 * The phrases are decorative — the shimmer already tells the user work is in
 * flight — so under reduced motion the cycle keeps running for its
 * information value while every transform and scramble is dropped.
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
  /** Transition used when the active phrase changes. */
  variant: {
    type: String,
    default: "cascade",
    validator: (v) => ["cascade", "swap", "scramble"].includes(v),
  },
  /** Milliseconds each phrase remains visible. */
  interval: { type: Number, default: 1800 },
  /** Seconds taken for one shimmer pass. */
  shimmerDuration: { type: Number, default: 2.2 },
});

const GLYPHS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SCRAMBLE_POOL = "abcdefghijklmnopqrstuvwxyz#$%&*+/<>";
const SCRAMBLE_STEP_MS = 45;

const index = ref(0);
const glyph = ref(GLYPHS[0]);
const displayed = ref(props.phrases[0] ?? "");

const phrase = computed(() => props.phrases[index.value] ?? "");
const words = computed(() => phrase.value.split(" "));

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

// --- Scramble ---

let scrambleTimer = null;

function stopScramble() {
  if (scrambleTimer) {
    clearInterval(scrambleTimer);
    scrambleTimer = null;
  }
}

/**
 * Resolve `target` one character at a time, filling the not-yet-resolved tail
 * with noise so the line never changes width mid-transition.
 */
function scrambleTo(target) {
  stopScramble();
  let resolved = 0;
  scrambleTimer = setInterval(() => {
    resolved += 1;
    if (resolved >= target.length) {
      displayed.value = target;
      stopScramble();
      return;
    }
    const noise = Array.from({ length: target.length - resolved }, () =>
      SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)],
    ).join("");
    displayed.value = target.slice(0, resolved) + noise;
  }, SCRAMBLE_STEP_MS);
}

watch(phrase, (next) => {
  if (props.variant === "scramble" && !reducedMotion()) {
    scrambleTo(next);
    return;
  }
  stopScramble();
  displayed.value = next;
});

watch(() => [props.phrases, props.interval], startCycle, { immediate: true });

onBeforeUnmount(() => {
  stopCycle();
  stopScramble();
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

.ui-reasoning__phrase.is-swap {
  display: inline-block;
  animation: uiPhraseSwap var(--duration-slow) var(--ease-out-strong);
}

.ui-reasoning__word {
  display: inline-block;
  white-space: pre;
  animation: uiPhraseCascade var(--duration-slow) var(--ease-out-strong) backwards;
}

.ui-reasoning__word:not(:last-child)::after {
  content: " ";
}

.ui-reasoning__phrase.is-scramble {
  font-variant-ligatures: none;
}

@keyframes uiPhraseSwap {
  from {
    opacity: 0;
    filter: blur(3px);
  }
}

@keyframes uiPhraseCascade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-reasoning__phrase.is-swap,
  .ui-reasoning__word {
    animation: none;
  }
}
</style>
