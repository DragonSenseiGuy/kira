<template>
  <div>
    <div class="stx-header">
      <h2>Keyboard Shortcuts</h2>
    </div>

    <div class="stx-card">
      <div
        v-for="action in KEYBIND_ACTIONS"
        :key="action.id"
        class="stx-item"
      >
        <span style="font-size: 0.9rem; color: var(--text-primary)">{{ action.label }}</span>

        <div class="kb-controls">
          <!-- Conflict / reserved warnings -->
          <span v-if="conflictFor === action.id" class="stx-error kb-warning">
            Already used by "{{ conflictWithLabel }}"
          </span>
          <span v-else-if="reservedFor === action.id" class="stx-error kb-warning">
            {{ reservedMessage }}
          </span>

          <button
            type="button"
            class="kb-capture"
            :class="{ listening: recordingId === action.id, conflict: conflictFor === action.id }"
            @click="toggleRecording(action)"
          >
            <template v-if="recordingId === action.id">Press keys…</template>
            <template v-else-if="!currentCombo(action.id)">
              <span class="kb-unset">Not set</span>
            </template>
            <template v-else>
              <kbd v-for="(part, i) in formatComboParts(currentCombo(action.id), isMac)" :key="i">{{ part }}</kbd>
              <span v-if="formatComboParts(currentCombo(action.id), isMac).length > 1" class="kb-plus">+</span>
            </template>
          </button>

          <button
            v-if="recordingId === action.id"
            type="button"
            class="stx-btn ghost kb-cancel"
            aria-label="Cancel recording"
            title="Cancel"
            @click.stop="stopRecording()"
          >
            <Icon icon="material-symbols:close-rounded" width="16" height="16" />
          </button>

          <button
            v-if="currentCombo(action.id) && currentCombo(action.id) !== normalizeCombo(action.default)"
            type="button"
            class="stx-btn ghost"
            :aria-label="`Reset ${action.label} to default`"
            title="Reset to default"
            @click="resetBind(action)"
          >
            <Icon icon="material-symbols:restart-alt-rounded" width="18" height="18" />
          </button>
        </div>
      </div>
    </div>

    <p class="stx-note">
      Browsers reserve some combinations (tab/window management like Ctrl/⌘+T, W, N and a
      few others).
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';
import { useSettings } from '~/composables/useSettings';
import { setKeybindRecording } from '~/composables/useKeybinds';
import {
  KEYBIND_ACTIONS,
  normalizeCombo,
  formatComboParts,
  eventToCombo,
  reservedComboWarning,
} from '~/utils/keybinds';

const settingsManager = useSettings();

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const recordingId = ref(null);
const conflictFor = ref(null); // action id showing a conflict error
const conflictWithLabel = ref('');
const reservedFor = ref(null);
const reservedMessage = ref('');

function currentCombo(actionId) {
  return normalizeCombo(settingsManager.settings.keybinds?.[actionId] || '');
}

function clearTransientState() {
  conflictFor.value = null;
  reservedFor.value = null;
  conflictWithLabel.value = '';
}

function toggleRecording(action) {
  if (recordingId.value === action.id) {
    stopRecording();
    return;
  }
  recordingId.value = action.id;
  setKeybindRecording(true);
  clearTransientState();
}

function stopRecording() {
  recordingId.value = null;
  setKeybindRecording(false);
  clearTransientState();
}

function resetBind(action) {
  save(action.id, action.default);
}

function save(actionId, rawCombo) {
  if (!settingsManager.settings.keybinds) {
    settingsManager.settings.keybinds = {};
  }
  settingsManager.settings.keybinds[actionId] = rawCombo;
  settingsManager.saveSettings();
}

function onKeyDown(e) {
  if (!recordingId.value) return;
  e.preventDefault();
  e.stopPropagation();
  // NOTE: Escape and Enter are intentionally RECORDABLE — canceling is
  // done via the ✕ button, clicking outside, or re-clicking the chip.

  const combo = eventToCombo(e, isMac);
  if (!combo) return; // modifier-only press

  // Duplicate bind? Reject with a pointer at the other action.
  const owner = KEYBIND_ACTIONS.find(
    (a) => a.id !== recordingId.value && currentCombo(a.id) === combo,
  );
  if (owner) {
    conflictFor.value = recordingId.value;
    conflictWithLabel.value = owner.label;
    stopRecording();
    return;
  }

  const reserved = reservedComboWarning(combo);
  save(recordingId.value, combo);

  if (reserved) {
    reservedFor.value = recordingId.value;
    reservedMessage.value = reserved;
  }
  stopRecording();
}

// Clicking anywhere outside the shortcut controls cancels an active
// recording (keeps every key — including Esc/Enter — bindable).
function onDocumentPointerDown(e) {
  if (!recordingId.value) return;
  if (e.target?.closest?.('.kb-controls')) return;
  stopRecording();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  setKeybindRecording(false);
});
</script>

<style scoped>
.kb-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-warning {
  font-size: 0.76rem;
  max-width: 320px;
  text-align: right;
}

.kb-capture {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 120px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.kb-capture:hover {
  border-color: var(--text-secondary);
}

.kb-capture.listening {
  border-color: var(--ink-3);
  background: var(--hover);
  color: var(--text-primary);
  font-size: 0.82rem;
  font-weight: 600;
  animation: kb-pulse 1.1s ease-in-out infinite;
}

.kb-capture.conflict {
  border-color: var(--danger);
}

@keyframes kb-pulse {
  50% {
    opacity: 0.55;
  }
}

.kb-capture kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  font-family: inherit;
  font-size: 0.76rem;
  color: var(--text-primary);
}

.kb-plus {
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.kb-unset {
  font-size: 0.78rem;
  color: var(--text-muted);
  font-style: italic;
}

.kb-cancel {
  width: 28px;
  height: 28px;
  padding: 0;
}
</style>
