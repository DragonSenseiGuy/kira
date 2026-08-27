/**
 * @file useModelPicker.js
 * @description Shared state + logic for the model picker surfaces (desktop
 * modal and mobile bottom sheet). Keeping it in one place guarantees both
 * UIs behave identically.
 *
 * Performance notes: the full Hack Club/OpenRouter catalog is ~840 models,
 * so the list is paginated (PAGE_SIZE at a time) and search is strict —
 * tokens must match the model NAME or ID, never the description. Descrip-
 * tions are marketing copy full of words like "deep" that would otherwise
 * flood results.
 */

import { computed, ref, watch } from "vue";
import { useSettings } from "./useSettings";
import {
  getConfiguredProviders,
  getActiveProviderId,
  getActiveProviderModelGroups,
  getFavoriteModels,
  toggleFavoriteModel,
  pickModelForProvider,
  fetchProviderModels,
  fetchHcFullModels,
  hasHcFullModels,
  HACKCLUB_PROVIDER_ID,
} from "./providers";

/** How many rows render initially / per "show more". */
export const MODEL_PAGE_SIZE = 60;

/**
 * Strict model search: EVERY whitespace-separated token must appear in
 * the model's name or ID. Descriptions are deliberately excluded.
 *
 * @param {Object} model
 * @param {string} rawQuery
 * @returns {boolean}
 */
export function matchesModelQuery(model, rawQuery) {
  const query = (rawQuery || "").trim().toLowerCase();
  if (!query) return true;
  const haystack = `${model.name || ""} ${model.id}`.toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
}

export function useModelPicker() {
  const settingsManager = useSettings();

  const query = ref("");
  const visibleCount = ref(MODEL_PAGE_SIZE);
  const loadingCatalog = ref(false);

  const providers = computed(() =>
    getConfiguredProviders(settingsManager.settings),
  );
  const activeProviderId = computed(() =>
    getActiveProviderId(settingsManager.settings),
  );

  /** Groups for the ACTIVE provider (Hack Club = full catalog). */
  const groups = computed(() =>
    getActiveProviderModelGroups(settingsManager.settings),
  );

  /** Flat model list for the active provider, deduplicated by id. */
  const allModels = computed(() => {
    const seen = new Set();
    const out = [];
    for (const group of groups.value) {
      for (const m of group.models || []) {
        if (!m || !m.id || seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  });

  /** Strictly filtered by query. */
  const filteredModels = computed(() => {
    if (!query.value.trim()) return allModels.value;
    return allModels.value.filter((m) => matchesModelQuery(m, query.value));
  });

  /** Favorites for the active provider, resolved to model objects. */
  const favoriteModels = computed(() =>
    getFavoriteModels(settingsManager.settings, activeProviderId.value),
  );

  /**
   * The main list EXCLUDES favorites — they're pinned in their own
   * section at the top, so rendering them again here would duplicate.
   */
  const favoriteIds = computed(
    () => new Set(favoriteModels.value.map((m) => m.id)),
  );
  const regularFilteredModels = computed(() =>
    filteredModels.value.filter((m) => !favoriteIds.value.has(m.id)),
  );

  /** Paginated slice of the main list actually rendered. */
  const visibleModels = computed(() =>
    regularFilteredModels.value.slice(0, visibleCount.value),
  );
  const hiddenCount = computed(
    () => Math.max(0, regularFilteredModels.value.length - visibleCount.value),
  );

  /**
   * Favorites that also match the current query (rendered inside the
   * favorites section).
   */
  const visibleFavorites = computed(() =>
    favoriteModels.value.filter((m) => matchesModelQuery(m, query.value)),
  );

  function resetForOpen() {
    query.value = "";
    visibleCount.value = MODEL_PAGE_SIZE;
  }

  function showMore() {
    visibleCount.value += MODEL_PAGE_SIZE;
  }

  /**
   * Makes sure the full catalog is available (fetch once; cached after).
   */
  async function ensureCatalogLoaded() {
    if (hasHcFullModels() || loadingCatalog.value) return;
    loadingCatalog.value = true;
    try {
      await fetchHcFullModels({
        apiKey: settingsManager.settings?.custom_api_key,
      });
    } finally {
      loadingCatalog.value = false;
    }
  }

  function selectModel(modelId) {
    settingsManager.settings.selected_model_id = modelId;
    recordLastModel(modelId);
    settingsManager.saveSettings();
  }

  function recordLastModel(modelId) {
    if (!settingsManager.settings.provider_last_model) {
      settingsManager.settings.provider_last_model = {};
    }
    settingsManager.settings.provider_last_model[activeProviderId.value] = modelId;
  }

  async function switchProvider(providerId) {
    if (providerId === activeProviderId.value) return;

    // Custom providers may need their model list fetched first.
    if (providerId !== HACKCLUB_PROVIDER_ID) {
      const provider = settingsManager.settings.custom_providers?.find(
        (p) => p.id === providerId,
      );
      if (provider && provider.baseUrl) {
        try {
          await fetchProviderModels(provider);
        } catch {
          // Selector shows an empty state; error surfaces in Settings.
        }
      }
    }

    recordLastModel(settingsManager.settings.selected_model_id);
    settingsManager.settings.active_provider_id =
      providerId === HACKCLUB_PROVIDER_ID ? "" : providerId;

    // Switch to the provider's "current" model: its last-used model, or
    // its default (Hack Club → kimi-k2.6; customs → first in list).
    const nextModel = pickModelForProvider(
      settingsManager.settings,
      providerId,
    );
    if (nextModel) {
      settingsManager.settings.selected_model_id = nextModel;
    }
    settingsManager.saveSettings();
    resetForOpen();
  }

  function toggleFavorite(modelId) {
    const added = toggleFavoriteModel(
      settingsManager.settings,
      activeProviderId.value,
      modelId,
    );
    settingsManager.saveSettings();
    return added;
  }

  function isFavorite(modelId) {
    const ids = settingsManager.settings.favorite_models?.[
      activeProviderId.value || HACKCLUB_PROVIDER_ID
    ];
    return Array.isArray(ids) ? ids.includes(modelId) : false;
  }

  // Reset pagination whenever the query changes so new searches start
  // from the top of the list.
  watch(query, () => {
    visibleCount.value = MODEL_PAGE_SIZE;
  });

  return {
    // state
    query,
    visibleCount,
    loadingCatalog,
    providers,
    activeProviderId,
    groups,
    allModels,
    filteredModels,
    visibleModels,
    hiddenCount,
    favoriteModels,
    visibleFavorites,
    // actions
    resetForOpen,
    showMore,
    ensureCatalogLoaded,
    selectModel,
    switchProvider,
    toggleFavorite,
    isFavorite,
  };
}
