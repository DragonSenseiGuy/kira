<template>
  <div>
    <div class="stx-header">
      <h2>Search &amp; Tools</h2>
      <p>
        Kira's web search is powered by Exa. You can choose to use Hack Club's Exa router (provided you've attached your Hack Club AI API key), attach or your own Exa key, or disable search entirely.
      </p>
    </div>

    <div class="stx-card">
      <div class="stx-card-title">Search backend</div>

      <div class="stx-item stacked">
        <div class="stx-options" role="radiogroup" aria-label="Search backend">
          <button
            v-for="option in sourceOptions"
            :key="option.value"
            type="button"
            class="stx-option"
            :class="{ active: currentSource === option.value }"
            role="radio"
            :aria-checked="currentSource === option.value"
            @click="setSource(option.value)"
          >
            <span class="opt-title">
              <Icon :icon="option.icon" width="18" height="18" />
              {{ option.label }}
            </span>
            <span class="opt-desc">{{ option.description }}</span>
          </button>
        </div>
      </div>

      <div v-if="currentSource === 'hackclub'" class="stx-item stacked">
        <div class="stx-note" style="margin: 0">
          Uses your Hack Club AI key from the Providers tab.
        </div>
      </div>

      <div v-if="currentSource === 'exa'" class="stx-item stacked">
        <div class="stx-info">
          <h3>Exa API key</h3>
          <p>Get one at dashboard.exa.ai.</p>
        </div>
        <div class="stx-input-container wide">
          <input
            v-model="exaKey"
            :type="showExaKey ? 'text' : 'password'"
            placeholder="your Exa API key"
            class="stx-input"
            style="max-width: none"
            autocomplete="off"
            @change="set('exa_api_key', exaKey)"
          />
          <button type="button" class="stx-btn ghost" @click="showExaKey = !showExaKey" :aria-label="showExaKey ? 'Hide key' : 'Show key'">
            <Icon :icon="showExaKey ? 'material-symbols:visibility-off' : 'material-symbols:visibility'" width="20" height="20" />
          </button>
        </div>
      </div>

      <div v-if="currentSource === 'off'" class="stx-item stacked">
        <div class="stx-note" style="margin: 0">
          The search toggle disappears from the chat box and models won't be offered the
          search/page-contents tools.
        </div>
      </div>
    </div>

    <div class="stx-card">
      <div class="stx-card-title">Chat behavior</div>
      <div class="stx-item">
        <div class="stx-info">
          <h3>Search enabled by default</h3>
          <p>New conversations start with the search toggle on</p>
        </div>
        <SwitchRoot
          class="switch-root stx-switch-root"
          :model-value="settings.search_enabled"
          @update:model-value="set('search_enabled', $event)"
        >
          <SwitchThumb class="switch-thumb stx-switch-thumb" />
        </SwitchRoot>
      </div>

      <div class="stx-item stacked">
        <div class="stx-info">
          <h3>Max tool iterations</h3>
          <p>
            How many rounds of tool calls a single reply may chain. Leave empty for unlimited
            (recommended).
          </p>
        </div>
        <input
          v-model.number="maxIterationsInput"
          type="number"
          min="1"
          step="1"
          placeholder="Unlimited"
          class="stx-input"
          style="max-width: 160px"
          aria-label="Max tool iterations"
          @change="setMaxIterations"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useSettings } from '~/composables/useSettings';

const settingsManager = useSettings();
const settings = settingsManager.settings;

const showExaKey = ref(false);
const exaKey = ref(settings.exa_api_key || '');

const sourceOptions = [
  {
    value: 'hackclub',
    label: 'Hack Club AI',
    icon: 'material-symbols:hub-outline-rounded',
    description: 'Bundled with your Hack Club AI key.',
  },
  {
    value: 'exa',
    label: 'My own Exa key',
    icon: 'material-symbols:key-vertical-outline-rounded',
    description: 'Use your personal Exa API key.',
  },
  {
    value: 'off',
    label: 'No search',
    icon: 'material-symbols:block-outline-rounded',
    description: 'Disable web search tools.',
  },
];

const currentSource = computed(() => settings.tool_search_source || 'hackclub');

function set(key, value) {
  settings[key] = value;
  settingsManager.saveSettings();
}

function setSource(value) {
  set('tool_search_source', value);
}

// Empty input = unlimited (stored as null). Values below 1 are ignored.
const maxIterationsInput = ref(settings.tool_max_iterations ?? '');

function setMaxIterations() {
  const value = Number(maxIterationsInput.value);
  if (!Number.isFinite(value) || value < 1) {
    settings.tool_max_iterations = null;
    maxIterationsInput.value = '';
  } else {
    settings.tool_max_iterations = Math.floor(value);
  }
  settingsManager.saveSettings();
}
</script>
