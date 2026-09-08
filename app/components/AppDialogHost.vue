<template>
  <div v-if="cfg" class="dlg-overlay" @pointerdown.self="onCancel">
    <div class="dlg-panel" role="dialog" aria-modal="true" :aria-label="cfg.title"
      @keydown.enter.exact.prevent="onConfirm">
      <div class="dlg-body">
        <h2 class="dlg-title">{{ cfg.title }}</h2>
        <p v-if="cfg.message" class="dlg-message">{{ cfg.message }}</p>
        <input v-if="cfg.kind === 'prompt'" ref="inputRef" v-model="value" type="text" class="dlg-input"
          :placeholder="cfg.placeholder" spellcheck="false" autocomplete="off" aria-label="Name"
          @keydown.enter.exact.prevent="onConfirm" />
      </div>
      <footer class="dlg-footer">
        <button v-if="cfg.kind !== 'alert'" type="button" class="dlg-btn ghost" @click="onCancel">
          {{ cfg.cancelLabel }}
        </button>
        <button ref="okRef" type="button" class="dlg-btn solid" :class="{ danger: cfg.danger }" @click="onConfirm">
          {{ cfg.confirmLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { useDialogState, settleDialog } from "~/composables/useDialogs";

const state = useDialogState();
const cfg = computed(() => state.current);

const value = ref("");
const inputRef = ref(null);
const okRef = ref(null);

// Each new dialog resets the input and moves focus to it (prompt) or to the
// confirming button (alert/confirm), so keyboard flow works immediately.
watch(
  () => state.current,
  async (c) => {
    if (!c) return;
    value.value = c.initial || "";
    await nextTick();
    if (c.kind === "prompt") {
      inputRef.value?.focus();
      inputRef.value?.select();
    } else {
      okRef.value?.focus();
    }
  },
);

function onCancel() {
  settleDialog(state.current?.kind === "prompt" ? null : false);
}

function onConfirm() {
  const c = state.current;
  if (!c) return;
  settleDialog(c.kind === "prompt" ? value.value.trim() : true);
}

// Captured on window so Esc always wins over other handlers while a dialog
// is visible (e.g. the Files dock also listens for Esc).
function onKey(e) {
  if (!state.current) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    onCancel();
  }
}

watch(
  () => !!state.current,
  (openNow) => {
    if (typeof window === "undefined") return;
    if (openNow) window.addEventListener("keydown", onKey, true);
    else window.removeEventListener("keydown", onKey, true);
  },
);

onBeforeUnmount(() => {
  if (typeof window !== "undefined") window.removeEventListener("keydown", onKey, true);
});
</script>

<style scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 2600;
  animation: dlg-fade 0.15s ease-out;
}
@keyframes dlg-fade {
  from { opacity: 0; }
}

.dlg-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  width: min(400px, 100%);
  animation: dlg-pop 0.16s cubic-bezier(.4, 1, .6, 1);
}
@keyframes dlg-pop {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
}

.dlg-body {
  padding: 20px 22px 6px;
}
.dlg-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  color: var(--text-primary);
}
.dlg-message {
  margin: 8px 0 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.dlg-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 14px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
}
.dlg-input:focus {
  outline: none;
  border-color: var(--ink-3);
  box-shadow: none;
}

.dlg-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 18px 18px;
}

.dlg-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
}
.dlg-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.dlg-btn.ghost {
  background: none;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.dlg-btn.ghost:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}
/* The confirm button is the neutral action pill, like every other primary. */
.dlg-btn.solid {
  background: var(--action);
  color: var(--action-on);
  border: none;
}
.dlg-btn.solid:hover:not(:disabled) {
  background: var(--action-hover);
}
/* Destructive confirmations read as outlined-danger instead of filled —
   keeps contrast correct in both themes via the --danger token. */
.dlg-btn.solid.danger {
  background: transparent;
  border: 1px solid var(--danger);
  color: var(--danger);
}
.dlg-btn.solid.danger:hover {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
}
</style>
