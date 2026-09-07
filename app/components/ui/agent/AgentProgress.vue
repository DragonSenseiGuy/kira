<template>
  <span class="ui-progress" role="status" aria-live="polite">
    <span class="ui-progress__glyph" :class="{ 'is-running': running }" aria-hidden="true" />
    <span class="ui-progress__label">{{ label }}</span>
    <span class="ui-progress__time">{{ formatted }}</span>
  </span>
</template>

<script setup>
/**
 * A compact activity glyph, action verb and live timer for longer-running
 * agent work — beUI's `agent-progress`. The timer is tabular so the row keeps
 * a fixed width as the digits tick, which is what stops a live counter from
 * nudging everything after it sideways.
 *
 * Pass `elapsedSeconds` to drive the clock yourself; leave it out and the
 * component runs its own from `initialSeconds` while `running` is true.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  /** Verb describing the agent's current activity. */
  label: { type: String, default: "Working" },
  /** Controlled elapsed time in seconds. Takes over from the internal timer. */
  elapsedSeconds: { type: Number, default: null },
  /** Starting time for the internal timer, in seconds. */
  initialSeconds: { type: Number, default: 0 },
  /** Whether the internal timer advances. Ignored when elapsedSeconds is set. */
  running: { type: Boolean, default: true },
});

const TICK_MS = 100;

const internal = ref(props.initialSeconds);
let timer = null;

const isControlled = computed(() => typeof props.elapsedSeconds === "number");

const elapsed = computed(() =>
  isControlled.value ? props.elapsedSeconds : internal.value,
);

/** `9.4s` under a minute, `2m 05s` above it — never a bare float of minutes. */
const formatted = computed(() => {
  const total = Math.max(0, elapsed.value || 0);
  if (total < 60) return `${total.toFixed(1)}s`;
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
});

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function sync() {
  stop();
  if (isControlled.value || !props.running) return;
  timer = setInterval(() => {
    internal.value += TICK_MS / 1000;
  }, TICK_MS);
}

watch(() => [props.running, props.elapsedSeconds], sync, { immediate: true });
watch(() => props.initialSeconds, (value) => {
  if (!isControlled.value) internal.value = value;
});

onBeforeUnmount(stop);
</script>

<style scoped>
.ui-progress {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.ui-progress__glyph {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: currentColor;
}

.ui-progress__glyph.is-running {
  animation: uiProgressPulse 1.2s var(--ease-in-out) infinite;
}

.ui-progress__time {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

@keyframes uiProgressPulse {
  50% {
    opacity: 0.35;
    transform: scale(0.8);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-progress__glyph.is-running {
    animation-duration: 2.4s;
  }
}
</style>
