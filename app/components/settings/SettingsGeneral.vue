<template>
  <div>
    <div class="stx-header">
      <h2>General</h2>
      <p>Basic appearance and model behavior.</p>
    </div>

    <div class="stx-card">
      <div class="stx-item">
        <div class="stx-info">
          <h3>Theme</h3>
          <p>System follows your device's light or dark setting</p>
        </div>
        <UiSegmented
          class="theme-choice"
          :model-value="themeChoice"
          :options="themeOptions"
          aria-label="Theme"
          @update:model-value="themeChoice = $event"
        />
      </div>

      <div class="stx-item">
        <div class="stx-info">
          <h3>Limit Tables for GPT-OSS</h3>
          <p>When using GPT-OSS models (20B or 120B), limit table usage as much as possible</p>
        </div>
        <SwitchRoot
          class="switch-root stx-switch-root"
          :model-value="settings.gpt_oss_limit_tables"
          @update:model-value="set('gpt_oss_limit_tables', $event)"
        >
          <SwitchThumb class="switch-thumb stx-switch-thumb" />
        </SwitchRoot>
      </div>

      <div class="stx-item" style="border-bottom: none">
        <div class="stx-info">
          <h3>Developer Mode</h3>
          <p>
            Reveals the model parameter controls (temperature, top_p, seed…) and
            developer tools like the copy-debug-info button on assistant messages
          </p>
        </div>
        <SwitchRoot
          class="switch-root stx-switch-root"
          :model-value="settings.show_debug_options"
          @update:model-value="set('show_debug_options', $event)"
        >
          <SwitchThumb class="switch-thumb stx-switch-thumb" />
        </SwitchRoot>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useStorage } from '@vueuse/core';
import UiSegmented from '~/components/ui/Segmented.vue';
import { useSettings } from '~/composables/useSettings';

const settingsManager = useSettings();
const settings = settingsManager.settings;

// Same key and values as the useDark() calls on the pages, which pick the
// change up from storage: "auto" follows the device, the others pin a theme.
const storedTheme = useStorage('vueuse-color-scheme', 'auto');
const themeOptions = [
  { value: 'auto', label: 'System', icon: 'material-symbols:computer-outline-rounded' },
  { value: 'light', label: 'Light', icon: 'material-symbols:light-mode-outline-rounded' },
  { value: 'dark', label: 'Dark', icon: 'material-symbols:dark-mode-outline-rounded' },
];
const themeChoice = computed({
  get: () => (themeOptions.some((option) => option.value === storedTheme.value) ? storedTheme.value : 'auto'),
  set: (value) => { storedTheme.value = value; },
});

function set(key, value) {
  settings[key] = value;
  settingsManager.saveSettings();
}
</script>
