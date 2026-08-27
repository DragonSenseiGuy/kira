import localforage from "localforage";
import { reactive } from "vue";
import { DEFAULT_MODEL_ID } from './availableModels';
import {
  isKnownModelId,
  parseCustomModelId,
  findCustomProvider,
  customProviderModels,
  findFullModelById,
  getActiveProviderId,
  hasHcFullModels,
} from './providers';
import DEFAULT_PARAMETERS from './defaultParameters';
import {
  DEFAULT_THRESHOLD_TOKENS,
  DEFAULT_KEEP_RECENT_TOKENS,
} from './contextCompressor';

/**
 * Manages application settings for the Libre Assistant Interface.
 */
class Settings {
  constructor() {
    // Loading state to track if settings have been loaded
    this.isLoaded = false;

    // Use a reactive reference for settings to improve reactivity
    const settings = reactive({
      // Version marker for future migrations
      version: 5,

      // --- User Profile Settings ---
      user_name: null, // User's name
      occupation: null, // User's occupation
      custom_instructions: null, // Custom instructions for Libre

      // --- Memory Settings ---
      notepad_enabled: false, // Whether the Notepad memory system is enabled

      // --- Context Compression Settings ---
      context_compression_enabled: true, // Auto-compress older context past the threshold
      context_compression_threshold_tokens: DEFAULT_THRESHOLD_TOKENS, // Compress once effective context exceeds this
      context_compression_keep_recent_tokens: DEFAULT_KEEP_RECENT_TOKENS, // How much recent context always stays verbatim

      // --- Model Settings ---
      selected_model_id: DEFAULT_MODEL_ID, // Default model ID

      // --- Search Settings ---
      search_enabled: false, // Whether search is enabled by default
      tool_search_source: 'hackclub', // 'hackclub' | 'exa' | 'off' — where the Exa search tools run
      exa_api_key: '', // User's own Exa API key (used when tool_search_source === 'exa')

      // --- Workspace / Sandbox Settings ---
      project_attachments: {}, // convoId -> [projectName] — projects mounted into a chat's workspace
      net_mode: 'ask', // Sandbox network egress: 'off' | 'ask' | 'auto'
      net_grants: {}, // domain -> { mode: 'always' } — approved sandbox network domains
      net_activity: [], // Recent sandbox network requests (capped, newest last)

      // --- Provider Settings ---
      active_provider_id: '', // Which provider is active ('' = Hack Club)
      custom_providers: [], // [{id, name, baseUrl, apiKey}] — custom OpenAI-compatible providers
      provider_last_model: {}, // providerId -> last selected model on it
      favorite_models: {}, // providerId -> [modelId] favorited in the picker
      // --- Keybind Settings ---
      keybinds: {
        focus_input: '/',
        new_chat: 'mod+alt+n',
        toggle_sidebar: 'mod+b',
        toggle_parameters: 'mod+alt+b',
        toggle_incognito: 'mod+alt+i',
      },

      // --- Model-Specific Settings ---
      model_settings: {}, // Per-model settings storage

      // --- Parameter Config Settings ---
      parameter_config: { ...DEFAULT_PARAMETERS },

      // --- GPT-OSS Specific Settings ---
      gpt_oss_limit_tables: false, // Whether to limit table usage for GPT-OSS models

      // --- Debug Settings ---
      show_debug_options: false, // Show developer-facing tools (e.g. the message debug copy button)

      // --- API Key Settings ---
      custom_api_key: '', // User's own API key (required for all API calls)
    });

    // Add type information for better type safety
    this.settings = reactive(settings);

    // Create a non-reactive copy of default settings to avoid circular references
    this.defaultSettings = {
      version: 5,
      notepad_enabled: false, // Whether the Notepad memory system is enabled
      context_compression_enabled: true, // Auto-compress older context past the threshold
      context_compression_threshold_tokens: DEFAULT_THRESHOLD_TOKENS, // Compress once effective context exceeds this
      context_compression_keep_recent_tokens: DEFAULT_KEEP_RECENT_TOKENS, // How much recent context always stays verbatim
      selected_model_id: DEFAULT_MODEL_ID, // Default model ID
      search_enabled: false, // Default value for search setting
      tool_search_source: 'hackclub', // Where the Exa search tools run
      exa_api_key: '', // Default empty Exa API key
      project_attachments: {}, // convoId -> [projectName]
      net_mode: 'ask', // Sandbox network egress mode
      net_grants: {}, // domain -> { mode: 'always' }
      net_activity: [], // Recent sandbox network requests (capped)
      active_provider_id: '',
      custom_providers: [], // Default: no custom providers configured
      provider_last_model: {},
      favorite_models: {}, // Default: no favorites
      keybinds: {
        focus_input: '/',
        new_chat: 'mod+alt+n',
        toggle_sidebar: 'mod+b',
        toggle_parameters: 'mod+alt+b',
        toggle_incognito: 'mod+alt+i',
      },
      model_settings: {}, // Default value for model settings
      parameter_config: { ...DEFAULT_PARAMETERS },
      gpt_oss_limit_tables: false, // Default value for GPT-OSS table limiting
      show_debug_options: false, // Default: developer debug tools hidden
      custom_api_key: '', // Default empty API key (user must provide their own)
    };

    // Load settings asynchronously
    this.loadSettings();
  }

  /**
   * Helper to deep merge objects, ensuring reactivity is maintained where possible.
   * This version handles merging into an existing reactive object.
   * @param {object} target - The reactive object to merge into.
   * @param {object} source - The object to merge from.
   * @returns {object} The merged object.
   */
  _deepMergeReactive(target, source) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (
          typeof sourceValue === "object" &&
          sourceValue !== null &&
          !Array.isArray(sourceValue) &&
          !(sourceValue instanceof Date)
        ) {
          // Initialize as reactive if needed
          if (
            !targetValue ||
            typeof targetValue !== "object" ||
            Array.isArray(targetValue) ||
            targetValue instanceof Date
          ) {
            target[key] = reactive({});
          }

          // Recursively merge objects
          this._deepMergeReactive(target[key], sourceValue);
        } else {
          // Direct assignment for primitives
          target[key] = sourceValue;
        }
      }
    }
    return target;
  }

  /**
   * Asynchronously loads settings from localforage.
   * Merges saved settings with default settings to handle new fields in updates.
   */
  async loadSettings() {
    try {
      const savedSettings = await localforage.getItem("settings");
      if (savedSettings != null) {
        // Start with a fresh deep copy of default settings
        const mergedSettings = { ...this.defaultSettings };

        // Then deep merge saved settings over it to apply user's preferences
        this._deepMergeReactive(mergedSettings, savedSettings);

        if (
          mergedSettings.selected_model_id === "moonshotai/kimi-k2-instruct-0905" ||
          !mergedSettings.selected_model_id
        ) {
          mergedSettings.selected_model_id = DEFAULT_MODEL_ID;
        }

        // If the persisted model is no longer resolvable — neither in the
        // Hack Club catalog nor a composite ID of an existing custom
        // provider — reset to the default immediately so the UI never
        // shows "Loading..." with a stale/removed model ID.
        if (
          hasHcFullModels() &&
          !isKnownModelId(
            mergedSettings,
            mergedSettings.selected_model_id,
            (id) => findFullModelById(id),
          )
        ) {
          console.warn(
            `[settings] Selected model ${mergedSettings.selected_model_id} is not available; resetting to ${DEFAULT_MODEL_ID}`
          );
          mergedSettings.selected_model_id = DEFAULT_MODEL_ID;
        }

        // Migration: v2 → v3 — rename the old notebook_memory_enabled
        // setting to notepad_enabled. The user-facing name changed and
        // the old storage key was retired.
        if (
          mergedSettings.notebook_memory_enabled !== undefined &&
          mergedSettings.notepad_enabled === undefined
        ) {
          mergedSettings.notepad_enabled = !!mergedSettings.notebook_memory_enabled;
        }
        delete mergedSettings.notebook_memory_enabled;

        // Migration: v4 → v5 — chunk-based compression settings were
        // replaced by threshold-based ones (auto compression + manual
        // compress button). Drop the retired keys; enabled/model carry over.
        delete mergedSettings.context_compression_chunk_size;
        // Migration: compression now runs on the selected model; the old per-task model setting is retired.
        delete mergedSettings.context_compression_model;
        // Migration: the curated repo list was retired; the full catalog is always used.
        delete mergedSettings.show_all_models;
        delete mergedSettings.context_compression_min_chunk_tokens;
        delete mergedSettings.context_compression_keep_recent_chunks;

        // Migration: If search_enabled is true and grounding parameter doesn't exist yet,
        // set grounding to true to preserve user's previous search preference
        if (mergedSettings.search_enabled &&
          (!mergedSettings.parameter_config || mergedSettings.parameter_config.grounding === undefined)) {
          if (!mergedSettings.parameter_config) {
            mergedSettings.parameter_config = { ...DEFAULT_PARAMETERS };
          }
          mergedSettings.parameter_config.grounding = true;
        }

        // Directly assign to the reactive settings object
        // This will update the reactivity system
        Object.assign(this.settings, mergedSettings);

        // IMPORTANT: Save back any changes made during the load (e.g., new defaults applied, or migrations)
        // Store a deep copy of the settings object to prevent DataCloneError with reactive arrays.
        await localforage.setItem(
          "settings",
          JSON.parse(JSON.stringify(this.settings))
        );
      } else {
        // No saved settings found, persist the default settings
        // A fresh, deep reactive copy should already be in this.settings from constructor
        await localforage
          .setItem("settings", JSON.parse(JSON.stringify(this.settings)))
          .catch((err) => {
            console.error(`Error saving initial default settings: ${err}`);
          });
      }

      // Mark settings as loaded
      this.isLoaded = true;
    } catch (err) {
      console.error("Failed to load settings from localForage:", err);
      // Still mark as loaded to prevent infinite loading attempts
      this.isLoaded = true;
    }
  }

  /**
   * Asynchronously saves the current settings to localforage.
   */
  async saveSettings() {
    try {
      // IMPORTANT: Store a deep copy of the settings object using JSON.parse(JSON.stringify())
      // This ensures no reactive proxies or non-clonable elements are passed to localforage.
      await localforage.setItem(
        "settings",
        JSON.parse(JSON.stringify(this.settings))
      );
    } catch (err) {
      console.error("Failed to save settings to localForage:", err);
    }
  }

  /**
   * Retrieves a specific setting by key.
   * @param {string} key - The key of the setting to retrieve.
   * @returns {*} The value of the setting.
   */
  getSetting(key) {
    return this.settings[key];
  }

  /**
   * Sets a specific setting by key. Useful for UI bindings.
   * @param {string} key - The key of the setting to set.
   * @param {*} value - The new value for the setting.
   */
  setSetting(key, value) {
    this.settings[key] = value;
    // We don't save here automatically to avoid excessive writes.
    // saveSettings() should be called explicitly by the UI logic after changes,
    // or if the change necessitates immediate persistence.
  }

  /**
   * Gets a setting for a specific model.
   * @param {string} modelId - The model ID
   * @param {string} key - The setting key
   * @returns {*} The value of the setting for the model.
   */
  getModelSetting(modelId, key) {
    if (this.settings.model_settings && this.settings.model_settings[modelId]) {
      return this.settings.model_settings[modelId][key];
    }
    return undefined;
  }

  /**
   * Sets a setting for a specific model.
   * @param {string} modelId - The model ID
   * @param {string} key - The setting key
   * @param {*} value - The new value for the setting.
   */
  setModelSetting(modelId, key, value) {
    if (!this.settings.model_settings) {
      this.settings.model_settings = {};
    }
    if (!this.settings.model_settings[modelId]) {
      this.settings.model_settings[modelId] = {};
    }
    this.settings.model_settings[modelId][key] = value;
    // We don't save here automatically to avoid excessive writes.
    // saveSettings() should be called explicitly by the UI logic after changes,
    // or if the change necessitates immediate persistence.
  }

  /**
   * Resets all settings to their default values and persists them.
   */
  async resetSettings() {
    // Perform a deep copy of default settings to avoid reference issues
    // and assign it directly to the existing reactive settings object.
    const newDefaults = this._deepMergeReactive({}, this.defaultSettings);
    Object.assign(this.settings, newDefaults);

    await this.saveSettings();
  }

  /**
   * Computed property to get the currently selected model object.
   * Resolves both Hack Club catalog models and custom-provider models
   * (composite IDs). Custom models are normalized into the same shape so
   * capability checks keep working.
   */
  get selectedModel() {
    const id = this.settings.selected_model_id;
    const hackClubModel = findFullModelById(id);
    if (hackClubModel) return hackClubModel;

    // Full Hack Club/OpenRouter catalog ("show all models")
    if (!parseCustomModelId(id)) {
      const full = findFullModelById(id);
      if (full) return full;
    }

    const parsed = parseCustomModelId(id);
    if (!parsed) return null;
    const provider = findCustomProvider(this.settings, parsed.providerId);
    if (!provider) return null;

    const raw = (customProviderModels[parsed.providerId] || []).find(
      (m) => m.id === parsed.modelId,
    );
    return {
      id,
      name: raw?.name || parsed.modelId,
      description: '',
      vision: raw?.vision === true,
      tool_use: raw?.tool_use !== false,
      reasoning: raw?.reasoning ?? { supported: false },
    };
  }

  /**
   * Computed property to get the name of the currently selected model
   */
  get selectedModelName() {
    return this.selectedModel ? this.selectedModel.name : 'Loading...';
  }
}

export default Settings;
