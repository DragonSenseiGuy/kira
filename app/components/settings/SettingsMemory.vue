<template>
  <div>
    <div class="stx-header">
      <h2>Memory</h2>
      <p>
        Your Notepad is a private document Libre maintains about you — observations about your
        projects, preferences and communication style, stored locally on your device and used as
        working memory.
      </p>
    </div>

    <div class="stx-card">
      <div class="stx-item">
        <div class="stx-info">
          <h3>Enable Notepad</h3>
          <p>Let Libre maintain a private Notepad about you across conversations</p>
        </div>
        <SwitchRoot
          class="switch-root stx-switch-root"
          :model-value="settings.notepad_enabled"
          @update:model-value="toggleNotepad"
        >
          <SwitchThumb class="switch-thumb stx-switch-thumb" />
        </SwitchRoot>
      </div>

      <template v-if="settings.notepad_enabled">
        <div v-if="notepadMetadata" class="stx-item stacked">
          <div style="display: flex; gap: 24px; flex-wrap: wrap">
            <span class="stx-badge muted">
              Last updated:
              {{ notepadMetadata.lastUpdated ? new Date(notepadMetadata.lastUpdated).toLocaleDateString() : 'Never' }}
            </span>
            <span class="stx-badge muted">Updates: {{ notepadMetadata.updateCount || 0 }}</span>
          </div>
        </div>

        <div class="stx-item stacked" style="padding-bottom: 20px">
          <div>
            <button class="stx-btn" @click="ui?.navigateToNotepad()">
              <Icon icon="material-symbols:book-outline-rounded" width="18" height="18" />
              Open My Notepad
            </button>
          </div>
        </div>

        <div class="stx-item stacked" style="border-bottom: none">
          <p class="stx-note" style="margin-bottom: 18px">
            The Notepad updates automatically in the background, typically once per day or after
            several new conversations.
          </p>
        </div>
      </template>

      <div v-else class="stx-item stacked" style="border-bottom: none">
        <p class="stx-note">The Notepad is currently disabled.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue';
import { Icon } from '@iconify/vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useSettings } from '~/composables/useSettings';
import { loadNotepad } from '~/composables/notepad';

const ui = inject('settings-ui', null);
const settingsManager = useSettings();
const settings = settingsManager.settings;

const notepadMetadata = ref(null);

onMounted(async () => {
  try {
    const notepad = await loadNotepad();
    notepadMetadata.value = notepad?.metadata || null;
  } catch {
    // Non-fatal: status line simply stays hidden.
  }
});

function toggleNotepad(value) {
  settings.notepad_enabled = value;
  settingsManager.saveSettings();
}
</script>
