<template>
  <div class="parameter-config-wrapper">
    <div :class="['parameter-config-overlay', { active: isOpen && isMobile }]" @click="closePanel"></div>
    <div class="parameter-config-panel" :class="{ active: isOpen }">
      <!-- Header -->
      <div class="panel-header">
        <span class="panel-title">Parameters</span>
        <div class="header-actions">
          <UiTooltip content="Reset to defaults" side="bottom">
            <UiIconButton
              icon="material-symbols:refresh"
              label="Reset to defaults"
              @click="resetToDefaults"
            />
          </UiTooltip>
          <UiIconButton icon="material-symbols:close" label="Close" @click="closePanel" />
        </div>
      </div>

      <div class="panel-content">
        <div class="settings-group">
          <div v-for="param in parameters" :key="param.name" class="setting-item">
            <div class="setting-header">
              <!-- The description is attached to the label rather than the whole
                   row, so it can't fire while the slider is being dragged. -->
              <UiTooltip :content="param.description" side="left">
                <label class="setting-label" tabindex="0">{{ param.label }}</label>
              </UiTooltip>
              <input v-if="param.type === 'seed'" type="number" :value="param.value.value" @input="param.inputHandler"
                class="value-input" placeholder="-1" />
            </div>
            <div class="input-slider-container">
              <SliderRoot v-if="param.type !== 'seed'" class="slider" :min="param.min" :max="param.max"
                :step="param.step" :model-value="[param.value.value]" @update:model-value="param.sliderHandler">
                <SliderTrack class="slider-track">
                  <SliderRange class="slider-range" />
                </SliderTrack>
                <SliderThumb class="slider-thumb" />
              </SliderRoot>
              <input v-if="param.type !== 'seed'" type="number" :value="param.value.value" @input="param.inputHandler"
                class="value-input" :min="param.min" :max="param.max" :step="param.step" />
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch, ref, onMounted, onUnmounted } from "vue";
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from "reka-ui";
import DEFAULT_PARAMETERS from '@/composables/defaultParameters';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  settingsManager: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(["close", "save"]);

// Mobile detection
const isMobile = ref(false);

const checkMobile = () => {
  isMobile.value = typeof window !== 'undefined' && window.innerWidth <= 950;
};

// Watch for window resize to update mobile status
let resizeObserver;

onMounted(() => {
  if (typeof window !== 'undefined') {
    checkMobile();
    resizeObserver = new ResizeObserver(checkMobile);
    resizeObserver.observe(document.body);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

// Individual computed properties for each parameter to ensure perfect synchronization
const temperature = computed({
  get: () => {
    if (!props.settingsManager?.settings?.parameter_config) return DEFAULT_PARAMETERS.temperature;
    return props.settingsManager.settings.parameter_config.temperature ?? DEFAULT_PARAMETERS.temperature;
  },
  set: (value) => {
    if (props.settingsManager) {
      // Ensure parameter_config exists
      if (!props.settingsManager.settings.parameter_config) {
        props.settingsManager.settings.parameter_config = { ...DEFAULT_PARAMETERS };
      }

      // Update the specific parameter
      props.settingsManager.settings.parameter_config.temperature = value;
      saveSettings();
    }
  }
});

const topP = computed({
  get: () => {
    if (!props.settingsManager?.settings?.parameter_config) return DEFAULT_PARAMETERS.top_p;
    return props.settingsManager.settings.parameter_config.top_p ?? DEFAULT_PARAMETERS.top_p;
  },
  set: (value) => {
    if (props.settingsManager) {
      // Ensure parameter_config exists
      if (!props.settingsManager.settings.parameter_config) {
        props.settingsManager.settings.parameter_config = { ...DEFAULT_PARAMETERS };
      }

      // Update the specific parameter
      props.settingsManager.settings.parameter_config.top_p = value;
      saveSettings();
    }
  }
});

// Handler functions for slider value changes
function handleTemperatureChange(value) {
  // Extract the first value from the array
  temperature.value = value[0];
}

function handleTopPChange(value) {
  // Extract the first value from the array
  topP.value = value[0];
}

function handleMaxTokensChange(value) {
  // Extract the first value from the array
  maxTokens.value = value[0];
}

const seed = computed({
  get: () => {
    if (!props.settingsManager?.settings?.parameter_config) return DEFAULT_PARAMETERS.seed;
    return props.settingsManager.settings.parameter_config.seed ?? DEFAULT_PARAMETERS.seed;
  },
  set: (value) => {
    if (props.settingsManager) {
      // Ensure parameter_config exists
      if (!props.settingsManager.settings.parameter_config) {
        props.settingsManager.settings.parameter_config = { ...DEFAULT_PARAMETERS };
      }

      // Update the specific parameter
      props.settingsManager.settings.parameter_config.seed = value;
      saveSettings();
    }
  }
});

const maxTokens = computed({
  get: () => {
    if (!props.settingsManager?.settings?.parameter_config) return DEFAULT_PARAMETERS.max_tokens;
    return props.settingsManager.settings.parameter_config.max_tokens ?? DEFAULT_PARAMETERS.max_tokens;
  },
  set: (value) => {
    if (props.settingsManager) {
      // Ensure parameter_config exists
      if (!props.settingsManager.settings.parameter_config) {
        props.settingsManager.settings.parameter_config = { ...DEFAULT_PARAMETERS };
      }

      // Update the specific parameter
      props.settingsManager.settings.parameter_config.max_tokens = value;
      saveSettings();
    }
  }
});

// Watch for changes in parameter config and save settings
watch(
  () => props.settingsManager?.settings?.parameter_config,
  () => {
    if (props.settingsManager) {
      saveSettings();
    }
  },
  { deep: true }
);

function closePanel() {
  emit("close");
}

function saveSettings() {
  if (props.settingsManager) {
    props.settingsManager.saveSettings();
  }
  emit("save");
}

function resetToDefaults() {
  if (props.settingsManager) {
    // Reset to default values
    const defaults = { ...DEFAULT_PARAMETERS };

    // Ensure parameter_config exists
    if (!props.settingsManager.settings.parameter_config) {
      props.settingsManager.settings.parameter_config = {};
    }

    // Apply defaults
    props.settingsManager.settings.parameter_config = defaults;
    saveSettings();
  }
}

// Define parameters configuration
const parameters = [
  {
    name: 'temperature',
    label: 'Temperature',
    type: 'slider',
    value: temperature,
    min: 0,
    max: 2,
    step: 0.05,
    description: 'Controls randomness: Lower values make outputs more deterministic, higher values make them more random.',
    inputHandler: (e) => temperature.value = parseFloat(e.target.value),
    sliderHandler: handleTemperatureChange
  },
  {
    name: 'top_p',
    label: 'Top P',
    type: 'slider',
    value: topP,
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered.',
    inputHandler: (e) => topP.value = parseFloat(e.target.value),
    sliderHandler: handleTopPChange
  },
  {
    name: 'max_tokens',
    label: 'Max Tokens',
    type: 'slider',
    value: maxTokens,
    min: 256,
    max: 65536,
    step: 256,
    description: 'Maximum number of tokens to generate. Lower values help when you have limited API credits.',
    inputHandler: (e) => maxTokens.value = parseInt(e.target.value),
    sliderHandler: handleMaxTokensChange
  },
  {
    name: 'seed',
    label: 'Seed',
    type: 'seed',
    value: seed,
    description: 'If specified, our system will make a best effort to sample deterministically.',
    inputHandler: (e) => seed.value = e.target.value ? parseInt(e.target.value) : null
  }
];
</script>

<style scoped>
.parameter-config-wrapper {
  position: relative;
}

.parameter-config-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: var(--scrim);
  opacity: 0;
  z-index: 1000;
  transition: opacity var(--duration-slow) var(--ease-out-strong);
  will-change: opacity;
  pointer-events: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.parameter-config-overlay.active {
  opacity: 1;
  pointer-events: auto;
}

.parameter-config-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100dvh;
  width: 300px;
  max-width: 90vw;
  z-index: 1001;
  background: var(--panel-bg);
  color: var(--text-primary);
  border-left: 1px solid var(--border);
  transform: translateX(100%);
  transition: transform var(--duration-slow) var(--ease-out-strong);
  display: flex;
  flex-direction: column;
  font-family: var(--font);
}

.parameter-config-panel.active {
  transform: translateX(0);
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  position: relative;
  justify-content: space-between;
  height: 60px;
  padding: 0 16px;
  background: var(--panel-bg);
  flex-shrink: 0;
}

.panel-title {
  font-family: "Inter", sans-serif;
  font-size: 1.1em;
  font-weight: 600;
  color: inherit;
  padding-left: 0;
}

/* Middleware section */

/* Switch styling from SettingsPanel */

.header-actions {
  display: flex;
  gap: 8px;
}

/* Main Content */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  background: var(--panel-bg);
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.setting-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--radius-control);
}

.setting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.setting-label {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
}

.input-slider-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.value-input {
  width: 60px;
  padding: 4px;
  border: none;
  border-radius: var(--radius-chip);
  background: var(--panel-input-bg);
  box-shadow: var(--shadow-hairline);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
  transition: box-shadow var(--duration-fast) var(--ease-out);
}

.value-input:focus {
  outline: none;
  box-shadow: 0 0 0 1px var(--ink-3);
}

.slider {
  position: relative;
  display: flex;
  height: 20px;
  background: transparent;
  outline: none;
  flex: 1;
  align-items: center;
  transition: none;
  margin: 0;
}

.slider-track {
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--line-strong);
  flex-grow: 1;
  position: relative;
}

.slider-range {
  position: absolute;
  height: 100%;
  background: var(--action);
  border-radius: var(--radius-full);
}

.slider-thumb {
  width: 14px;
  height: 14px;
  border-radius: var(--radius-full);
  background: var(--card);
  box-shadow: 0 0 0 1px var(--line-strong), 0 1px 3px #00000024;
  cursor: grab;
  display: block;
  z-index: 10;
  transition:
    box-shadow var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out-strong);
}

.slider-thumb:hover {
  transform: scale(1.1);
}

.slider-thumb:active {
  cursor: grabbing;
}

.slider-thumb:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--ink-3);
}

/* Tooltip */

/* Mobile responsiveness */
@media (max-width: 950px) {
  .parameter-config-panel {
    position: fixed;
    width: 80vw;
    max-width: 340px;
  }
  
  .setting-label {
    font-size: 0.9rem;
  }
  
  .value-input {
    width: 50px;
    font-size: 0.85rem;
  }
  
  .panel-title {
    font-size: 1rem;
  }
}
</style>