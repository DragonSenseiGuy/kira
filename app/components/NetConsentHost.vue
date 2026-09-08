<template>
  <Teleport to="body">
    <Transition name="nc">
      <div v-if="pending" class="nc-overlay" role="dialog" aria-label="Network permission request">
        <UiAgentToolApproval
          tool="sandbox.fetch"
          title="Allow network access?"
          :description="pending.url"
          :status="status"
          :parameters="parameters"
          @approve="answer(true, false)"
          @always-allow="answer(true, true)"
          @deny="answer(false, false)"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * Global host for sandbox network-consent prompts. The decision logic lives
 * in composables/sandboxNet.js; this component only renders the question.
 * If no host is mounted, sandboxNet falls back to window.confirm().
 *
 * The card answers the sandbox immediately on click and then holds on screen
 * for a beat showing the outcome, so the decision is visible rather than the
 * prompt just vanishing. `answer` takes (allowed, remember) — sandboxNet
 * packs both into the value it resolves.
 */
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { emitter } from "~/composables/emitter";

const SETTLE_MS = 900;

const pending = ref(null);
const status = ref("pending");
let dismissTimer = null;

const parameters = computed(() =>
  pending.value ? [{ id: "domain", label: "Domain", value: pending.value.domain }] : [],
);

function onRequest({ url, domain, answer: resolve }) {
  clearTimeout(dismissTimer);
  status.value = "pending";
  pending.value = { url, domain, resolve };
}

function answer(allowed, remember) {
  if (!pending.value) return;

  // Both halves of the decision travel in the answer itself, so there is no
  // window flag and no ordering to get right.
  pending.value.resolve(allowed, remember);

  status.value = allowed ? "approved" : "denied";
  dismissTimer = setTimeout(() => {
    pending.value = null;
    status.value = "pending";
  }, SETTLE_MS);
}

onMounted(() => emitter.on("net-consent-request", onRequest));
onBeforeUnmount(() => {
  emitter.off("net-consent-request", onRequest);
  clearTimeout(dismissTimer);
});
</script>

<style scoped>
.nc-overlay {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2000;
  width: 340px;
  max-width: calc(100vw - 32px);
}

.nc-enter-active,
.nc-leave-active {
  transition:
    opacity var(--duration) var(--ease-out-strong),
    transform var(--duration) var(--ease-out-strong);
}

.nc-enter-from,
.nc-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .nc-enter-active,
  .nc-leave-active {
    transition: none;
  }
}
</style>
