import { reactive } from 'vue';
import { isKnownModelId, findFullModelById, hasHcFullModels } from './providers';

/**
 * Remote model list configuration for Libre Assistant.
 *
 * The model catalog is now decentralised: it is fetched from the
 * Libre-Assistant-Model-List repository and cached locally so it is
 * available immediately on startup. After startup, the app always checks
 * the remote source for updates and refreshes the local cache when the list
 * (or logos) have changed.
 *
 * Logo assets are also fetched from the remote repository and cached as
 * base64 data URLs so the local public/ai_logos folder is no longer needed.
 */

const REMOTE_MODEL_LIST_URL =
  'https://raw.githubusercontent.com/Mostlime12195/Libre-Assistant-Model-List/refs/heads/main/model-list.json';

const REPO_RAW_BASE =
  'https://raw.githubusercontent.com/Mostlime12195/Libre-Assistant-Model-List/refs/heads/main';

const MODEL_LIST_CACHE_KEY = 'libre-model-list';
const LOGO_CACHE_PREFIX = 'libre-model-logo:';

/** Reactive array of the currently available model categories. */
export const availableModels = reactive([]);

/**
 * The default model ID. This is updated from the remote model list once it
 * has been loaded, but starts with a hard-coded fallback so that settings can
 * be constructed before the remote catalog is available.
 */
export let DEFAULT_MODEL_ID = 'moonshotai/kimi-k2.6';

/** True once the initial (cached or fallback) model list has been applied. */
let isInitialised = false;

let loadPromise = null;

/**
 * Converts a logo path from the remote catalog into an absolute URL.
 * @param {string} logoPath
 * @returns {string|null}
 */
function resolveLogoUrl(logoPath) {
  if (!logoPath) return null;
  if (logoPath.startsWith('http')) return logoPath;
  if (logoPath.startsWith('/')) return `${REPO_RAW_BASE}${logoPath}`;
  return `${REPO_RAW_BASE}/${logoPath}`;
}

/**
 * Tries to read a cached logo data URL from localStorage.
 * @param {string} logoPath
 * @returns {string|null}
 */
function getCachedLogoUrl(logoPath) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${LOGO_CACHE_PREFIX}${logoPath}`);
  } catch (e) {
    console.error('[models] Failed to read cached logo:', e);
    return null;
  }
}

/**
 * Applies a fetched/cached model list to the reactive `availableModels` array
 * and updates the default model ID. Logo paths are rewritten to use cached
 * data URLs when available, otherwise absolute remote URLs.
 *
 * @param {Object} data
 * @param {string} [data.defaultModelId]
 * @param {Array}  [data.categories]
 */
export function applyModelList(data) {
  if (!data || !Array.isArray(data.categories)) return;

  if (data.defaultModelId) {
    DEFAULT_MODEL_ID = data.defaultModelId;
  }

  const processedCategories = data.categories.map((category) => ({
    ...category,
    logo: getCachedLogoUrl(category.logo) || resolveLogoUrl(category.logo),
    models: Array.isArray(category.models)
      ? category.models.map((model) => ({ ...model }))
      : [],
  }));

  availableModels.length = 0;
  availableModels.push(...processedCategories);
  isInitialised = true;
}

/**
 * Loads the model list from the local cache, if one exists.
 * @returns {boolean} Whether a cached list was found and applied.
 */
export function loadModelListFromCache() {
  if (typeof window === 'undefined') return false;
  try {
    const cached = window.localStorage.getItem(MODEL_LIST_CACHE_KEY);
    if (cached) {
      applyModelList(JSON.parse(cached));
      return true;
    }
  } catch (e) {
    console.error('[models] Failed to load cached model list:', e);
  }
  return false;
}

/**
 * Fetches the current remote model list.
 * @returns {Promise<Object|null>}
 */
async function fetchRemoteModelList() {
  try {
    const response = await fetch(REMOTE_MODEL_LIST_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (e) {
    console.error('[models] Failed to fetch remote model list:', e);
    return null;
  }
}

/**
 * Encodes a string to base64 in a Unicode-safe way.
 * @param {string} str
 * @returns {string}
 */
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Fetches and caches any logos that are not already in localStorage.
 *
 * @param {Array} categories
 * @returns {Promise<void>}
 */
async function cacheLogos(categories) {
  if (typeof window === 'undefined') return;

  const logoPaths = new Set();
  for (const category of categories) {
    if (category.logo) logoPaths.add(category.logo);
  }

  await Promise.all(
    Array.from(logoPaths).map(async (logoPath) => {
      const cacheKey = `${LOGO_CACHE_PREFIX}${logoPath}`;
      if (window.localStorage.getItem(cacheKey)) return;

      try {
        const url = resolveLogoUrl(logoPath);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const svgText = await response.text();
        const dataUrl = `data:image/svg+xml;base64,${toBase64(svgText)}`;
        window.localStorage.setItem(cacheKey, dataUrl);
      } catch (e) {
        console.error(`[models] Failed to cache logo ${logoPath}:`, e);
      }
    }),
  );
}

/**
 * Loads the remote model list, caches it, caches any missing logos, and
 * refreshes the reactive model list if the remote version differs from the
 * cached version. If no local cache exists yet, the remote list is applied
 * immediately.
 *
 * This function is safe to call multiple times: concurrent calls share the
 * same promise.
 *
 * @returns {Promise<void>}
 */
export async function loadModelList() {
  if (typeof window === 'undefined') return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const hadCache = isInitialised;
    const remoteData = await fetchRemoteModelList();
    if (!remoteData) return;

    const cachedDataStr = window.localStorage.getItem(MODEL_LIST_CACHE_KEY);
    const cachedData = cachedDataStr ? JSON.parse(cachedDataStr) : null;

    // Update the cache and the reactive list whenever the remote list differs.
    if (JSON.stringify(remoteData) !== JSON.stringify(cachedData)) {
      window.localStorage.setItem(MODEL_LIST_CACHE_KEY, JSON.stringify(remoteData));
      applyModelList(remoteData);
    } else if (!hadCache) {
      // If the cache was identical to remote but we had no local cache applied
      // (e.g. fresh browser profile), still apply the remote list now.
      applyModelList(remoteData);
    }

    // Cache any logos that are missing locally, then re-apply so the cached
    // data URLs are used.
    await cacheLogos(remoteData.categories);
    applyModelList(remoteData);
  })();

  return loadPromise;
}

/**
 * If the user's currently selected model ID is not present in the available
 * model list, reset it to the DEFAULT model ID immediately. This prevents the
 * UI from lingering in a "Loading..." state with an invalid model ID.
 *
 * @param {Object} settingsManager
 */
export function validateSelectedModel(settingsManager) {
  if (!settingsManager?.isLoaded || !settingsManager?.settings) return;
  // Don't reset while no catalog source is available to judge against
  // (curated list empty AND full catalog not fetched yet).
  if (availableModels.length === 0 && !hasHcFullModels()) return;

  const currentId = settingsManager.settings.selected_model_id;
  // Composite custom-provider IDs stay valid as long as their provider
  // exists — their model list may not be fetched yet, which is fine.
  if (
    isKnownModelId(
      settingsManager.settings,
      currentId,
      (id) => findModelById(availableModels, id) || findFullModelById(id),
    )
  ) {
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

// On the client, initialise the model list from the local cache immediately so
// the UI can render without waiting for the network. The remote check is
// started from app.vue once the application mounts.
if (typeof window !== 'undefined') {
  loadModelListFromCache();
}

export default availableModels;
