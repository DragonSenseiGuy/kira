import { computed } from 'vue';
import { useSettings } from './useSettings';

/**
 * Developer Mode (Settings -> General). The single accessor for the flag: it
 * gates the model parameter controls (dock, top-bar button, palette command)
 * and developer tools like the copy-debug-info button on assistant messages.
 *
 * The setting persists under the historical `show_debug_options` key so
 * existing installs keep whatever they had selected; that key is the only
 * place the old name should ever appear.
 *
 * @returns {import('vue').ComputedRef<boolean>} Whether Developer Mode is on.
 */
export function useDeveloperMode() {
  const settingsManager = useSettings();
  return computed(() => !!settingsManager.settings.show_debug_options);
}
