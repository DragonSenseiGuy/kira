<template>
  <div>
    <div class="stx-header">
      <h2>General</h2>
      <p>Basic appearance and model behavior.</p>
    </div>

    <div class="stx-card">
      <div class="stx-item">
        <div class="stx-info">
          <h3>Dark Mode</h3>
          <p>Toggle between light and dark themes</p>
        </div>
        <SwitchRoot
          class="switch-root stx-switch-root"
          :model-value="isDark"
          @update:model-value="toggleDark()"
        >
          <SwitchThumb class="switch-thumb stx-switch-thumb" />
        </SwitchRoot>
      </div>

      <div class="stx-item" style="border-bottom: none">
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
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useDark, useToggle } from '@vueuse/core';
import { useSettings } from '~/composables/useSettings';

const settingsManager = useSettings();
const settings = settingsManager.settings;

const isDark = useDark();
const toggleDark = useToggle(isDark);

function set(key, value) {
  settings[key] = value;
  settingsManager.saveSettings();
}
</script>
