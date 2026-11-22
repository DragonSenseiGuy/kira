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

      <div class="stx-item">
        <div class="stx-info">
          <h3>Notify when a reply finishes</h3>
          <p>
            Show a desktop notification when a reply finishes while Kira is in
            the background. It names the chat, never its content
          </p>
          <p v-if="notifyProblem" class="stx-notify-problem" role="status">{{ notifyProblem }}</p>
        </div>
        <SwitchRoot
          class="switch-root stx-switch-root"
          aria-label="Notify when a reply finishes"
          :model-value="settings.notify_on_reply"
          @update:model-value="setNotify"
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
import { ref } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useDark, useToggle } from '@vueuse/core';
import { useSettings } from '~/composables/useSettings';
import { confirmNotifications, requestNotificationPermission } from '~/utils/replyNotification';

const settingsManager = useSettings();
const settings = settingsManager.settings;

const isDark = useDark();
const toggleDark = useToggle(isDark);

function set(key, value) {
  settings[key] = value;
  settingsManager.saveSettings();
}

const notifyProblem = ref('');

async function setNotify(on) {
  notifyProblem.value = '';
  if (on) {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      notifyProblem.value = permission === 'unsupported'
        ? 'This browser does not support notifications.'
        : 'Notifications are blocked for this site. Allow them in your browser settings, then turn this on again.';
      set('notify_on_reply', false);
      return;
    }
    if (!confirmNotifications()) {
      notifyProblem.value = 'This browser cannot show notifications from a web page.';
      set('notify_on_reply', false);
      return;
    }
  }
  set('notify_on_reply', on);
}
</script>
