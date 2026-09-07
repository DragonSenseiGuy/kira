<template>
  <div>
    <div class="stx-header">
      <h2>General</h2>
      <p>Basic appearance and model behavior.</p>
    </div>

    <div class="stx-card">
      <div class="stx-item stacked">
        <div class="stx-info">
          <h3>Theme</h3>
          <p>
            Each theme ships a light and a dark flavour — the switch below picks
            which one you see.
          </p>
        </div>

        <div class="theme-grid" role="radiogroup" aria-label="Theme">
          <button
            v-for="option in themes"
            :key="option.id"
            type="button"
            role="radio"
            class="theme-option"
            :class="{ active: theme === option.id }"
            :aria-checked="theme === option.id"
            :title="option.description"
            @click="setTheme(option.id)"
          >
            <!-- The swatch renders the palette it is *previewing*, not the one
                 the page is using: data-theme scopes the tokens to this span,
                 and `.dark` mirrors whichever flavour is currently in play. -->
            <span class="theme-swatch" :data-theme="option.id" :class="{ dark: isDark }">
              <span class="theme-swatch-card">
                <span class="theme-swatch-line" />
                <span class="theme-swatch-line short" />
              </span>
              <span class="theme-swatch-dots">
                <span class="theme-swatch-dot accent" />
                <span class="theme-swatch-dot action" />
              </span>
            </span>

            <span class="theme-name">{{ option.name }}</span>
            <span class="theme-flavours">{{ option.flavours }}</span>
          </button>
        </div>
      </div>

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

      <div class="stx-item" style="border-bottom: none">
        <div class="stx-info">
          <h3>Show Debug Options</h3>
          <p>Show developer-facing tools, like the copy-debug-info button on assistant messages</p>
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
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { useDark, useToggle } from '@vueuse/core';
import { useSettings } from '~/composables/useSettings';
import { useTheme } from '~/composables/useTheme';

const settingsManager = useSettings();
const settings = settingsManager.settings;

const isDark = useDark();
const toggleDark = useToggle(isDark);

const { theme, themes, setTheme } = useTheme();

function set(key, value) {
  settings[key] = value;
  settingsManager.saveSettings();
}
</script>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--spacing-12);
  width: 100%;
}

.theme-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-8);
  border-radius: var(--radius-card);
  background: transparent;
  box-shadow: var(--shadow-hairline);
  text-align: left;
  transition:
    background-color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out),
    transform var(--duration) var(--ease-out-strong);
}

.theme-option:hover {
  background: var(--btn-hover);
}

.theme-option:active {
  transform: scale(var(--press-scale));
}

.theme-option.active {
  box-shadow: 0 0 0 2px var(--accent);
}

.theme-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* The preview. Every colour in here comes from the previewed theme's own
   tokens, so a new theme needs no extra styling to show up correctly. */
.theme-swatch {
  position: relative;
  display: block;
  height: 62px;
  margin-bottom: var(--spacing-8);
  padding: var(--spacing-8);
  border-radius: var(--radius-control);
  background: var(--page);
  box-shadow: inset 0 0 0 1px var(--line-strong);
  overflow: hidden;
}

.theme-swatch-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 68%;
  padding: 6px;
  border-radius: var(--radius-chip);
  background: var(--card);
  box-shadow: inset 0 0 0 1px var(--line);
}

.theme-swatch-line {
  display: block;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--ink);
}

.theme-swatch-line.short {
  width: 60%;
  background: var(--ink-3);
}

.theme-swatch-dots {
  position: absolute;
  right: var(--spacing-8);
  bottom: var(--spacing-8);
  display: flex;
  gap: 4px;
}

.theme-swatch-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.theme-swatch-dot.accent {
  background: var(--accent);
}

.theme-swatch-dot.action {
  background: var(--action);
}

.theme-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.theme-flavours {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
