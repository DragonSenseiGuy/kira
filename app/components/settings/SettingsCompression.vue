<template>
  <div>
    <div class="stx-header">
      <h2>Context Compression</h2>
      <p>
        Long conversations can be compressed so the model keeps going without running out of
        context. Compression runs on your currently selected model.
      </p>
    </div>

    <div class="stx-card">
      <div class="stx-item">
        <div class="stx-info">
          <h3>Auto compression</h3>
          <p>Automatically compress older context once a conversation grows past the threshold</p>
        </div>
        <SwitchRoot
          class="switch-root stx-switch-root"
          :model-value="settings.context_compression_enabled"
          @update:model-value="set('context_compression_enabled', $event)"
        >
          <SwitchThumb class="switch-thumb stx-switch-thumb" />
        </SwitchRoot>
      </div>

      <div class="stx-item">
        <div class="stx-info">
          <h3>Threshold (tokens)</h3>
          <p>Estimated context size at which compression is available</p>
        </div>
        <input
          v-model.number="threshold"
          type="number"
          min="4000"
          step="1000"
          class="stx-input small"
          @change="set('context_compression_threshold_tokens', threshold)"
        />
      </div>

      <div class="stx-item" style="border-bottom: none">
        <div class="stx-info">
          <h3>Keep recent (tokens)</h3>
          <p>How much of the most recent conversation is kept verbatim</p>
        </div>
        <input
          v-model.number="keepRecent"
          type="number"
          min="1000"
          step="500"
          class="stx-input small"
          @change="set('context_compression_keep_recent_tokens', keepRecent)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useSettings } from '~/composables/useSettings';

const settingsManager = useSettings();
const settings = settingsManager.settings;

const threshold = ref(settings.context_compression_threshold_tokens);
const keepRecent = ref(settings.context_compression_keep_recent_tokens);

function set(key, value) {
  settings[key] = value;
  settingsManager.saveSettings();
}
</script>
