import { isKnownModelId, findFullModelById, hasHcFullModels, HACKCLUB_DEFAULT_MODEL_ID } from './providers';

/**
 * @file availableModels.js
 * @description Pure helpers that derive UI / API behaviour from a model's
 * metadata, plus selection validation.
 *
 * The model catalog itself is decentralised: Kira uses the full
 * Hack Club / OpenRouter catalog (see `hcFullModels` in providers.js). That
 * catalog is fetched at runtime through the `/api/models` relay, cached in
 * localStorage, and refreshed in the background whenever it changes (see
 * `fetchHcFullModels`). There is no separate curated list anymore.
 */

/** The default model ID — Hack Club's designated default. */
export const DEFAULT_MODEL_ID = HACKCLUB_DEFAULT_MODEL_ID;

/**
 * If the user's currently selected model ID is not present in the available
 * model list, reset it to the DEFAULT model ID immediately. This prevents the
 * UI from lingering in a "Loading..." state with an invalid model ID.
 *
 * @param {Object} settingsManager
 */
export function validateSelectedModel(settingsManager) {
  if (!settingsManager?.isLoaded || !settingsManager?.settings) return;
  // Don't reset until the catalog has been fetched at least once.
  if (!hasHcFullModels()) return;

  const currentId = settingsManager.settings.selected_model_id;
  // Composite custom-provider IDs stay valid as long as their provider
  // exists — their model list may not be fetched yet, which is fine.
  if (isKnownModelId(settingsManager.settings, currentId, (id) => findFullModelById(id))) {
    return;
  }

  if (currentId !== DEFAULT_MODEL_ID) {
    console.warn(
      `[models] Selected model ${currentId} is not in the available model list; resetting to ${DEFAULT_MODEL_ID}`,
    );
    settingsManager.settings.selected_model_id = DEFAULT_MODEL_ID;
    settingsManager.saveSettings();
  }
}

// --- PURE HELPER FUNCTIONS (used by UI and API pipeline) ---

/**
 * Normalizes legacy reasoning formats to the new schema
 * @param {Object} model - The model object
 * @returns {Object} Normalized reasoning configuration
 */
export function normalizeReasoningConfig(model) {
  const r = model.reasoning;

  // Already new format
  if (typeof r === 'object' && r !== null && 'supported' in r) {
    return r;
  }

  // Legacy: reasoning: false
  if (r === false) {
    return { supported: false };
  }

  // Legacy: reasoning: true
  if (r === true) {
    const hasEffort = model.extra_parameters?.reasoning_effort;
    return {
      supported: true,
      toggleable: false,
      effort: hasEffort
        ? {
            levels: hasEffort[0],
            default: hasEffort[1],
          }
        : undefined,
    };
  }

  // Legacy: reasoning: [true, false]
  if (Array.isArray(r) && r.length === 2 && r[0] === true && r[1] === false) {
    return { supported: true, toggleable: true, defaultEnabled: true };
  }

  // Legacy: reasoning: "model-id"
  if (typeof r === 'string') {
    return {
      supported: true,
      toggleable: true,
      defaultEnabled: false,
      alternateModel: r,
    };
  }

  // Fallback: no reasoning support
  return { supported: false };
}

/**
 * Should show on/off toggle in UI?
 * @param {Object} model - The model object
 * @returns {boolean}
 */
export function showReasoningToggle(model) {
  const config = normalizeReasoningConfig(model);
  return config.supported && config.toggleable === true;
}

/**
 * Should show effort dropdown in UI?
 * @param {Object} model - The model object
 * @returns {boolean}
 */
export function showReasoningEffortSelector(model) {
  const config = normalizeReasoningConfig(model);
  return (
    config.supported &&
    config.effort &&
    Array.isArray(config.effort.levels) &&
    config.effort.levels.length > 0
  );
}

/**
 * Get the default reasoning effort for a model
 * @param {Object} model - The model object
 * @returns {string} Default effort level
 */
export function getDefaultReasoningEffort(model) {
  const config = normalizeReasoningConfig(model);

  // Toggleable models start disabled when defaultEnabled is explicitly false
  if (config.toggleable && config.defaultEnabled === false) {
    return 'none';
  }

  // Toggleable models without an effort config default to the generic "on" state
  if (config.toggleable && !config.effort) {
    return 'default';
  }

  return config.effort?.default || 'default';
}

/**
 * Get the list of reasoning effort options that should appear in the UI.
 * For toggleable models with effort levels, "none" (shown as "Off") is
 * prepended so reasoning can be turned off from the same dropdown.
 * @param {Object} model - The model object
 * @returns {Array<string>} Effort options for the dropdown
 */
export function getReasoningEffortOptions(model) {
  const config = normalizeReasoningConfig(model);
  if (!config.supported || !config.effort || !Array.isArray(config.effort.levels)) {
    return [];
  }
  const options = [...config.effort.levels];
  if (config.toggleable) {
    options.unshift('none');
  }
  return options;
}

/**
 * Format a reasoning effort value for display in the UI.
 * @param {string} value - The raw effort value
 * @returns {string} Human-readable label
 */
export function formatReasoningLabel(value) {
  if (value === 'none') return 'Off';
  if (!value) return '';
  if (value === 'default') return 'Default';
  if (value === 'xhigh') return 'XHigh';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Check if reasoning is enabled based on user settings
 * @param {Object} model - The model object
 * @param {string} userEffort - The user's selected effort setting
 * @returns {boolean}
 */
export function isReasoningEnabled(model, userEffort) {
  const config = normalizeReasoningConfig(model);

  if (!config.supported) return false;

  // Non-toggleable models always have reasoning enabled
  if (!config.toggleable) return true;

  // Toggleable models: check if effort is 'none'
  return userEffort !== 'none';
}

/**
 * Build API request parameters for reasoning
 * @param {Object} model - The model object
 * @param {Object} userSettings - User settings object with reasoning_effort
 * @returns {Object} { reasoningParams, alternateModel }
 */
export function buildReasoningParams(model, userSettings) {
  const config = normalizeReasoningConfig(model);

  if (!config.supported) {
    return { reasoningParams: null, alternateModel: null };
  }

  const effort = userSettings?.reasoning_effort ?? config.effort?.default ?? 'default';
  const isEnabled = effort !== 'none';

  // Model routing: return alternate model when enabled
  if (config.alternateModel && isEnabled) {
    return {
      reasoningParams: null,
      alternateModel: config.alternateModel,
    };
  }

  // Toggleable: send enabled flag, and include effort when configured
  if (config.toggleable) {
    if (!isEnabled) {
      return {
        reasoningParams: { enabled: false },
        alternateModel: null,
      };
    }
    if (config.effort && effort !== 'default') {
      return {
        reasoningParams: { enabled: true, effort: effort },
        alternateModel: null,
      };
    }
    return {
      reasoningParams: { enabled: true },
      alternateModel: null,
    };
  }

  // Always-on + effort: only send effort, NOT enabled
  if (config.effort && effort !== 'default') {
    return {
      reasoningParams: { effort: effort },
      alternateModel: null,
    };
  }

  // Always-on without effort: send nothing (API handles automatically)
  return { reasoningParams: null, alternateModel: null };
}

/**
 * Check if a model supports tool use (e.g., search, function calling).
 *
 * Defaults to true when the property is not specified on the model, matching
 * the existing server-side check in `message.js`
 * (`selectedModelInfo?.tool_use !== false`). This keeps the UI consistent
 * with the request pipeline: if a model is missing the `tool_use` field, it
 * is treated as tool-capable.
 *
 * @param {Object} model - The model object
 * @returns {boolean}
 */
export function supportsToolUse(model) {
  return model?.tool_use !== false;
}

/**
 * Finds a model by its ID in the available models list, including nested categories.
 * @param {Array} models - The list of models to search.
 * @param {string} id - The ID of the model to find.
 * @returns {Object|null} The found model object or null.
 */
export function findModelById(models, id) {
  if (!models || !Array.isArray(models)) return null;
  for (const item of models) {
    if (item.id === id) {
      return item;
    }
    if (item.models && Array.isArray(item.models)) {
      const found = findModelById(item.models, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
