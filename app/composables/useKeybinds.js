/**
 * @file useKeybinds.js
 * @description Runtime dispatcher for user-customizable keyboard
 * shortcuts. Each mounted instance registers a single capture-phase
 * keydown listener and fires only the actions it was given.
 *
 * Behavior contract:
 *   - Modifier-less binds (e.g. "/") never fire while typing in an
 *     input/textarea/contenteditable.
 *   - Matching binds preventDefault + stopPropagation so the browser and
 *     other handlers don't double-act.
 */

import { onMounted, onBeforeUnmount } from 'vue';
import { useSettings } from './useSettings';
import { eventToCombo, isTextEntryTarget } from '~/utils/keybinds';

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * True while the Shortcuts settings screen is recording a new binding.
 * Dispatchers stand down during recording so pressing, say, mod+b
 * captures the combo instead of toggling the sidebar.
 */
let recordingActive = false;

export function setKeybindRecording(active) {
  recordingActive = !!active;
}

/**
 * @param {Record<string, () => void>} actions  Map of keybind action id → handler.
 */
export function useKeybinds(actions) {
  const settingsManager = useSettings();

  function onKeyDown(e) {
    if (recordingActive) return;

    const combo = eventToCombo(e, isMac);
    if (!combo) return;

    const binds = settingsManager.settings.keybinds;
    if (!binds) return;

    // Only consider ids this instance owns.
    for (const id of Object.keys(actions)) {
      if ((binds[id] || '').toLowerCase() !== combo) continue;

      // Don't let modifier-less shortcuts hijack typing.
      const hasModifier = combo.split('+').length > 1;
      if (!hasModifier && isTextEntryTarget(e.target)) return;

      e.preventDefault();
      e.stopPropagation();
      actions[id]?.();
      return;
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown, true);
  });
}
