<template>
  <div>
    <div class="stx-header">
      <h2>Customization</h2>
      <p>Personalize your experience. These details are shared with the assistant in every conversation.</p>
    </div>

    <div class="stx-card">
      <div class="stx-item stacked">
        <div class="stx-info">
          <h3>Your name</h3>
          <p>Shown to the assistant so it can address you personally.</p>
        </div>
        <div class="stx-input-container wide">
          <input
            v-model="settings.user_name"
            type="text"
            placeholder="Enter your name"
            class="stx-input"
            style="max-width: none"
            autocomplete="off"
            @change="save"
          />
        </div>
      </div>

      <div class="stx-item stacked">
        <div class="stx-info">
          <h3>Your occupation</h3>
          <p>Helps the assistant tailor explanations to your background (e.g. student, developer, researcher).</p>
        </div>
        <div class="stx-input-container wide">
          <input
            v-model="settings.occupation"
            type="text"
            placeholder="e.g. Software Engineer"
            class="stx-input"
            style="max-width: none"
            autocomplete="off"
            @change="save"
          />
        </div>
      </div>

      <div class="stx-item stacked" style="border-bottom: none">
        <div class="stx-info">
          <h3>Custom instructions</h3>
          <p>What custom instructions do you want Kira to follow? These take priority over the default guidelines.</p>
        </div>
        <textarea
          v-model="settings.custom_instructions"
          placeholder="Be precise, be witty, always explain like I'm a beginner, etc."
          class="stx-input"
          rows="4"
          style="max-width: none"
          @change="save"
        ></textarea>
      </div>
    </div>

    <div class="stx-note">
      Your name, occupation, and custom instructions are added to the system prompt for every chat. Leave a field blank to omit it.
    </div>
  </div>
</template>

<script setup>
import { useSettings } from '~/composables/useSettings';

const settingsManager = useSettings();
const settings = settingsManager.settings;

function save() {
  settingsManager.saveSettings();
}
</script>
