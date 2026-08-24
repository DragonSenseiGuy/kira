/**
 * @file providers.js
 * @description Multi-provider support for Libre Assistant.
 *
 * Libre Assistant ships with the Hack Club AI proxy as its built-in
 * provider. Users can additionally configure any number of custom
 * OpenAI-compatible providers (OpenRouter, Groq, a local Ollama, …),
 * each with its own name, base URL and API key.
 *
 * Model identity:
 *   - Hack Club models keep their plain IDs (`anthropic/claude-...`).
 *   - Custom-provider models use composite IDs so a single
 *     `selected_model_id` setting keeps working everywhere:
 *         `${providerId}::${modelId}`
 *     e.g. `pr_8f2::deepseek/deepseek-chat`. The separator is chosen to
 *     never collide with real model IDs (which use single `/` or `:`).
 *
 * Requests to custom providers are relayed by the same `/api/ai` server
 * route via an `upstreamBaseUrl` field; the server validates the URL
 * against SSRF rules before using it (see server/utils/upstream.js).
 */

import { reactive } from "vue";
import { getSessionToken } from "~/composables/useSession";

/** Provider id of the built-in Hack Club AI proxy. */
export const HACKCLUB_PROVIDER_ID = "hackclub";

/** Upstream base of the Hack Club AI proxy (OpenAI/OpenRouter-compatible). */
export const HACKCLUB_BASE_URL = "https://ai.hackclub.com/proxy/v1";

/**
 * Default model when switching to Hack Club with no remembered choice.
 * Deliberately NOT "first of the catalog" — the full list is huge and its
 * order is arbitrary.
 */
export const HACKCLUB_DEFAULT_MODEL_ID = "moonshotai/kimi-k2.6";

/** Separator between provider id and model id in composite model IDs. */
export const PROVIDER_ID_SEPARATOR = "::";

/**
 * Well-known OpenAI-compatible endpoints offered as one-click presets in
 * Settings → Providers. None of these carry keys — users paste their own.
 *
 * `local: true` presets point at the USER'S machine. They are called
 * directly from the browser (never relayed through the server), so they
 * work even when Libre Assistant itself is hosted remotely.
 */
export const PRESET_PROVIDERS = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    description: "Access hundreds of models through one key.",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    description: "Ultra-fast inference for open models.",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    description: "DeepSeek's own API endpoint.",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    description: "Mistral's hosted models.",
  },
  {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    description: "Open-source model cloud.",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    description: "Fast open-model serving.",
  },
  {
    id: "ollama-local",
    name: "Ollama (this machine)",
    baseUrl: "http://localhost:11434/v1",
    local: true,
    description:
      "Local models via Ollama. Called straight from your browser — enable CORS in Ollama once.",
  },
  {
    id: "lmstudio-local",
    name: "LM Studio (this machine)",
    baseUrl: "http://localhost:1234/v1",
    local: true,
    description:
      "Local models via LM Studio. Called straight from your browser — enable CORS in LM Studio once.",
  },
];

/**
 * Detects loopback endpoints (the user's own machine). These are called
 * DIRECTLY from the browser instead of through the server relay, which is
 * what makes them work even when the site is hosted remotely.
 *
 * @param {string} baseUrl
 * @returns {boolean}
 */
export function isLocalBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) return false;
  try {
    const url = new URL(baseUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Composite model ID helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Builds a composite model ID for a custom-provider model.
 * @param {string} providerId
 * @param {string} modelId
 * @returns {string}
 */
export function buildCustomModelId(providerId, modelId) {
  return `${providerId}${PROVIDER_ID_SEPARATOR}${modelId}`;
}

/**
 * Parses a composite model ID.
 * @param {string} id
 * @returns {{providerId: string, modelId: string}|null} null when the ID is
 *   not a composite custom-provider ID (i.e. it belongs to Hack Club).
 */
export function parseCustomModelId(id) {
  if (typeof id !== "string") return null;
  const idx = id.indexOf(PROVIDER_ID_SEPARATOR);
  if (idx <= 0 || idx === id.length - PROVIDER_ID_SEPARATOR.length) return null;
  const providerId = id.slice(0, idx);
  const modelId = id.slice(idx + PROVIDER_ID_SEPARATOR.length);
  if (!providerId || !modelId) return null;
  return { providerId, modelId };
}

/**
 * Generates a new unique provider id.
 * @returns {string}
 */
export function generateProviderId() {
  return (
    "pr_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
  );
}

// ---------------------------------------------------------------------------
// Credential / target resolution (pure — takes a settings snapshot)
// ---------------------------------------------------------------------------

/**
 * Finds a configured custom provider by id.
 * @param {Object} settings  Settings snapshot (settingsManager.settings).
 * @param {string} providerId
 * @returns {Object|null} {id, name, baseUrl, apiKey}
 */
export function findCustomProvider(settings, providerId) {
  const providers = Array.isArray(settings?.custom_providers)
    ? settings.custom_providers
    : [];
  return providers.find((p) => p && p.id === providerId) || null;
}

/**
 * Resolves where a chat completion should go based on the ACTIVE provider
 * and the selected model.
 *
 * Back-compat: if `active_provider_id` was never set but the selected model
 * is a composite custom-provider ID, the active provider is inferred from
 * that ID (pre-multi-provider selections keep working).
 *
 * @param {Object} settings  Settings snapshot.
 * @returns {{
 *   providerId: string,
 *   modelId: string,          // raw model id WITHOUT any provider prefix
 *   apiKey: string,
 *   upstreamBaseUrl: string|null, // null routes through Hack Club
 * }}
 */
export function resolveChatTarget(settings) {
  const rawSelected = settings?.selected_model_id || "";
  const parsed = parseCustomModelId(rawSelected);
  const modelId = parsed ? parsed.modelId : rawSelected;

  let activeId = settings?.active_provider_id;
  if (!activeId && parsed) {
    activeId = parsed.providerId; // legacy selection infers the provider
  }

  if (activeId && activeId !== HACKCLUB_PROVIDER_ID) {
    const provider = findCustomProvider(settings, activeId);
    if (provider && provider.baseUrl) {
      return {
        providerId: provider.id,
        modelId,
        apiKey: provider.apiKey || "",
        upstreamBaseUrl: provider.baseUrl,
        // Loopback endpoints are called straight from the browser.
        direct: isLocalBaseUrl(provider.baseUrl),
      };
    }
    // Provider removed — fall back to Hack Club below.
  }

  return {
    providerId: HACKCLUB_PROVIDER_ID,
    modelId,
    apiKey: settings?.custom_api_key || "",
    upstreamBaseUrl: null,
    direct: false,
  };
}

/**
 * Resolves credentials for BACKGROUND completions (title generation,
 * summarization, compression, notepad consolidation). These use cheap
 * Hack Club models by default; when the user has no Hack Club key we fall
 * back to their first configured custom provider that has a key, so the
 * background features still work in bring-your-own-endpoint setups.
 *
 * @param {Object} settings  Settings snapshot.
 * @param {string} [explicitApiKey]  An explicit Hack Club key, when the
 *   caller already has one. Takes precedence.
 * @returns {{customApiKey?: string, upstreamBaseUrl?: string}}
 */
export function resolveCompletionCredentials(settings, explicitApiKey) {
  if (explicitApiKey) {
    return { customApiKey: explicitApiKey };
  }
  const providers = Array.isArray(settings?.custom_providers)
    ? settings.custom_providers
    : [];
  const withKey = providers.find((p) => p && p.apiKey && p.baseUrl);
  if (withKey) {
    return {
      customApiKey: withKey.apiKey,
      upstreamBaseUrl: withKey.baseUrl,
    };
  }
  if (settings?.custom_api_key) {
    return { customApiKey: settings.custom_api_key };
  }
  return {};
}

/**
 * Returns true when the given model ID can be used right now: either it is
 * present in the Hack Club catalog, or it is a composite ID whose provider
 * still exists. Used to avoid resetting the user's selection before a
 * custom provider's model list finishes loading.
 *
 * @param {Object} settings  Settings snapshot.
 * @param {string} modelId
 * @param {Function} hackClubLookup  (id) => model|null over the HC catalog.
 * @returns {boolean}
 */
export function isKnownModelId(settings, modelId, hackClubLookup) {
  if (!modelId) return false;
  const parsed = parseCustomModelId(modelId);
  if (!parsed) {
    return !!hackClubLookup(modelId);
  }
  return !!findCustomProvider(settings, parsed.providerId);
}

// ---------------------------------------------------------------------------
// Custom-provider model lists (reactive cache + fetch through the server)
// ---------------------------------------------------------------------------

const PROVIDER_MODELS_CACHE_PREFIX = "libre-provider-models:";

/**
 * Reactive map of providerId -> array of raw `{id, ...}` model objects as
 * reported by the provider's `/models` endpoint. Hydrated from
 * localStorage on startup and refreshed on demand.
 */
export const customProviderModels = reactive({});

if (typeof window !== "undefined") {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(PROVIDER_MODELS_CACHE_PREFIX)) continue;
      const providerId = key.slice(PROVIDER_MODELS_CACHE_PREFIX.length);
      try {
        const cached = JSON.parse(window.localStorage.getItem(key));
        if (Array.isArray(cached)) customProviderModels[providerId] = cached;
      } catch {
        // Ignore malformed cache entries; they will be refreshed.
      }
    }
  } catch {
    // localStorage unavailable (private mode etc.) — cache stays empty.
  }
}

function persistProviderModels(providerId, models) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${PROVIDER_MODELS_CACHE_PREFIX}${providerId}`,
      JSON.stringify(models),
    );
  } catch {
    // Non-fatal: quota errors just mean no offline cache.
  }
}

export function clearCachedProviderModels(providerId) {
  delete customProviderModels[providerId];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(
        `${PROVIDER_MODELS_CACHE_PREFIX}${providerId}`,
      );
    } catch {
      // ignore
    }
  }
}

const inflightModelFetches = new Map();

/**
 * Fetches (or returns cached) models for a custom provider. The request is
 * relayed through our own `/api/models` route to dodge CORS and keep the
 * key handling consistent. Concurrent calls share one in-flight promise.
 *
 * @param {Object} provider  {id, baseUrl, apiKey}
 * @param {Object} [options]
 * @param {boolean} [options.force]  Bypass the cache.
 * @returns {Promise<Array>} Raw model objects [{id, ...}]
 */
export async function fetchProviderModels(provider, { force = false } = {}) {
  if (!provider || !provider.id || !provider.baseUrl) return [];

  if (!force && Array.isArray(customProviderModels[provider.id])) {
    return customProviderModels[provider.id];
  }
  if (inflightModelFetches.has(provider.id)) {
    return inflightModelFetches.get(provider.id);
  }

  const promise = (async () => {
    try {
      let response;
      if (isLocalBaseUrl(provider.baseUrl)) {
        // Local runtimes are listed DIRECTLY from the browser — the
        // server relay could never reach the user's own machine.
        const base = String(provider.baseUrl).replace(/\/+$/, "");
        try {
          response = await fetch(`${base}/models`, {
            headers: provider.apiKey
              ? { Authorization: `Bearer ${provider.apiKey}` }
              : {},
          });
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          throw new Error(
            `Could not reach ${base} — is the runtime running and CORS enabled?`,
            { cause: error },
          );
        }
        if (!response.ok) {
          throw new Error(`Model list request failed (${response.status})`);
        }
      } else {
        // /api/models is protected by the session-token guard — the token
        // MUST be attached or every request 403s (this broke Groq et al).
        response = await fetch("/api/models", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": await getSessionToken(),
            ...(provider.apiKey ? { "x-api-key": provider.apiKey } : {}),
          },
          body: JSON.stringify({ baseUrl: provider.baseUrl }),
        });
        if (!response.ok) {
          // h3 error bodies carry { statusCode, statusMessage } — surface the
          // real reason (e.g. disallowed local upstream, rejected key).
          let message = `Model list request failed (${response.status})`;
          try {
            const err = await response.json();
            if (err?.statusMessage || err?.message) {
              message = err.statusMessage || err.message;
            }
          } catch {
            // Non-JSON error body — keep the generic message.
          }
          throw new Error(message);
        }
      }
      const data = await response.json();
      const models = Array.isArray(data?.data)
        ? data.data.filter((m) => m && typeof m.id === "string")
        : [];
      customProviderModels[provider.id] = models;
      persistProviderModels(provider.id, models);
      return models;
    } finally {
      inflightModelFetches.delete(provider.id);
    }
  })();

  inflightModelFetches.set(provider.id, promise);
  return promise;
}

/**
 * Builds selector-ready "category" groups for every configured custom
 * provider that has a (possibly empty) cached model list. Groups follow
 * the same shape as Hack Club catalog categories so existing dropdown UIs
 * can render them unchanged:
 *   { category: <name>, logo: null, models: [{id: composite, name, ...}] }
 *
 * @param {Object} settings  Settings snapshot.
 * @returns {Array}
 */
// ---------------------------------------------------------------------------
// Active-provider selection model
//
// The user picks ONE ACTIVE provider; the model selector shows only that
// provider's models. Hack Club's model list is ALWAYS the full fetched
// OpenRouter/Hack Club catalog — the old curated repo list is retired.
// ---------------------------------------------------------------------------

/** Shape returned for every configured provider (Hack Club included). */
export function getConfiguredProviders(settings) {
  const providers = Array.isArray(settings?.custom_providers)
    ? settings.custom_providers.filter((p) => p && p.id && p.name)
    : [];
  return [
    {
      id: HACKCLUB_PROVIDER_ID,
      name: "Hack Club AI",
      baseUrl: HACKCLUB_BASE_URL,
      locked: true, // cannot be edited or removed
      local: false,
      apiKeySet: !!settings?.custom_api_key,
    },
    ...providers.map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      locked: false,
      local: isLocalBaseUrl(p.baseUrl),
      apiKeySet: !!p.apiKey,
    })),
  ];
}

/**
 * Returns the id of the currently active provider.
 *
 * `""` is an EXPLICIT "Hack Club" — only a genuinely absent field
 * (pre-multi-provider settings) falls back to inferring from a composite
 * selection. Treating "" as unset made every switch BACK to Hack Club
 * resolve against the previous provider's catalog instead.
 */
export function getActiveProviderId(settings) {
  const raw = settings?.active_provider_id;
  if (raw !== undefined && raw !== null) {
    return raw || HACKCLUB_PROVIDER_ID;
  }

  // Legacy: infer from a composite selection when the field was never saved.
  const parsed = parseCustomModelId(settings?.selected_model_id);
  if (parsed && findCustomProvider(settings, parsed.providerId)) {
    return parsed.providerId;
  }
  return HACKCLUB_PROVIDER_ID;
}

/**
 * Model groups for the ACTIVE provider only. Always returns an array of
 * `{category?, logo, models}` groups ready for the selectors.
 *
 * @param {Array} curatedCategories  Reactive curated repo catalog.
 * @param {Object} settings  Settings snapshot.
 */
export function getActiveProviderModelGroups(curatedCategories, settings) {
  const activeId = getActiveProviderId(settings);

  if (activeId !== HACKCLUB_PROVIDER_ID) {
    const provider = findCustomProvider(settings, activeId);
    if (!provider) {
      return [...(curatedCategories || [])]; // stale state → curated fallback
    }
    return [
      {
        category: provider.name,
        logo: null,
        _providerId: provider.id,
        models: (customProviderModels[provider.id] || []).map((m) => ({
          id: buildCustomModelId(provider.id, m.id),
          name: m.name || m.id,
          description: m.description || "",
          vision: m.vision === true,
          tool_use: m.tool_use !== false,
          reasoning: m.reasoning ?? { supported: false },
        })),
      },
    ];
  }

  // Hack Club AI. The FULL fetched catalog is the model list — the old
  // curated repo list is no longer used anywhere.
  return [
    {
      category: "All models",
      logo: null,
      _fullCatalog: true,
      models: hcFullModels,
    },
  ];
}

/** Stored last-used model per provider (`provider_last_model`). */
export function getLastModelForProvider(settings, providerId) {
  if (!providerId) return "";
  return settings?.provider_last_model?.[providerId] || "";
}

/**
 * Chooses the model to select when switching to a provider: the last one
 * used on that provider, else its first available model.
 *
 * @param {Object} settings  Settings snapshot (mutated copy is NOT made).
 * @param {string} providerId
 * @returns {string|null} A full selected_model_id value, or null.
 */
/**
 * Chooses the model to select when switching to a provider — its
 * "current" model:
 *   1. The provider's last-used model (if it still exists in its list).
 *   2. Otherwise the provider's default: Hack Club → HACKCLUB_DEFAULT_MODEL_ID,
 *      custom providers → the first model in their list.
 *
 * @param {Object} settings  Settings snapshot (mutated copy is NOT made).
 * @param {string} providerId
 * @returns {string|null} A full selected_model_id value, or null.
 */
export function pickModelForProvider(curatedCategories, settings, providerId) {
  // 1. Restore the provider's current model when it still exists.
  const last = getLastModelForProvider(settings, providerId);
  if (last) {
    const groups = getActiveProviderModelGroupsForProvider(
      curatedCategories,
      settings,
      providerId,
    );
    const all = groups.flatMap((g) => g.models || []);
    if (all.some((m) => m.id === last)) return last;
  }

  // 2. Provider defaults.
  if (providerId === HACKCLUB_PROVIDER_ID) {
    return HACKCLUB_DEFAULT_MODEL_ID;
  }

  const groups = getActiveProviderModelGroupsForProvider(
    curatedCategories,
    settings,
    providerId,
  );
  const first = groups.flatMap((g) => g.models || [])[0];
  return first ? first.id : null;
}

/**
 * Like getActiveProviderModelGroups but scoped to an explicit provider id
 * (used by pickModelForProvider during a switch, when the ambient
 * active-provider state is mid-transition). Purely derived from the
 * providerId — no reliance on settings.active_provider_id.
 */
function getActiveProviderModelGroupsForProvider(
  curatedCategories,
  settings,
  providerId,
) {
  return evaluateGroupsForProvider(curatedCategories, settings, providerId);
}

function evaluateGroupsForProvider(curatedCategories, settings, providerId) {
  if (providerId !== HACKCLUB_PROVIDER_ID) {
    const provider = findCustomProvider(settings, providerId);
    if (!provider) return [];
    return [
      {
        category: provider.name,
        logo: null,
        _providerId: provider.id,
        models: (customProviderModels[provider.id] || []).map((m) => ({
          id: buildCustomModelId(provider.id, m.id),
          name: m.name || m.id,
          description: m.description || "",
          vision: m.vision === true,
          tool_use: m.tool_use !== false,
          reasoning: m.reasoning ?? { supported: false },
        })),
      },
    ];
  }
  return [{ category: "All models", logo: null, _fullCatalog: true, models: hcFullModels }];
}

// ---------------------------------------------------------------------------
// Favorite models (stored per provider)
// ---------------------------------------------------------------------------

/**
 * Returns the favorite model IDs for a provider (empty array when none).
 * @param {Object} settings
 * @param {string} providerId
 * @returns {string[]}
 */
export function getFavoriteModelIds(settings, providerId) {
  const favorites = settings?.favorite_models;
  const list = favorites?.[providerId || HACKCLUB_PROVIDER_ID];
  return Array.isArray(list) ? list : [];
}

/**
 * Resolves a provider's favorites to full model objects (skipping ones no
 * longer present in the provider's catalog).
 */
export function getFavoriteModels(curatedCategories, settings, providerId) {
  const ids = getFavoriteModelIds(settings, providerId);
  if (ids.length === 0) return [];
  const all = getActiveProviderModelGroupsForProvider(
    curatedCategories,
    settings,
    providerId,
  ).flatMap((g) => g.models || []);
  const byId = new Map(all.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Toggles a model's favorite status for a provider. Mutates the given
 * settings object; the caller is responsible for persisting.
 *
 * @param {Object} settings
 * @param {string} providerId
 * @param {string} modelId
 * @returns {boolean} The new favorite state.
 */
export function toggleFavoriteModel(settings, providerId, modelId) {
  if (!modelId) return false;
  const key = providerId || HACKCLUB_PROVIDER_ID;
  if (!settings.favorite_models || typeof settings.favorite_models !== "object") {
    settings.favorite_models = {};
  }
  const current = Array.isArray(settings.favorite_models[key])
    ? settings.favorite_models[key]
    : [];

  if (current.includes(modelId)) {
    settings.favorite_models[key] = current.filter((id) => id !== modelId);
    return false;
  }
  settings.favorite_models[key] = [...current, modelId];
  return true;
}

/**
 * True when the model is favorited for the given provider.
 */
export function isFavoriteModel(settings, providerId, modelId) {
  return getFavoriteModelIds(settings, providerId).includes(modelId);
}

// ---------------------------------------------------------------------------
// Full Hack Club / OpenRouter model list ("show all models")
// ---------------------------------------------------------------------------

const HC_FULL_MODELS_CACHE_KEY = "libre-hc-full-models";

/**
 * Reactive array of normalized models from the FULL Hack Club catalog
 * (which mirrors every OpenRouter model). Entries are slimmed before
 * caching to keep localStorage usage sane on a very large list.
 */
export const hcFullModels = reactive([]);

if (typeof window !== "undefined") {
  try {
    const cached = window.localStorage.getItem(HC_FULL_MODELS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) hcFullModels.push(...parsed);
    }
  } catch {
    // Malformed cache — will be refetched.
  }
}

function persistHcFullModels() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HC_FULL_MODELS_CACHE_KEY,
      JSON.stringify(hcFullModels),
    );
  } catch {
    // Quota exceeded — the in-memory list still works this session.
  }
}

/**
 * Maps an OpenRouter-style model entry (as served by Hack Club's
 * /proxy/v1/models) into the shape our selectors and pipeline expect.
 *
 * @param {Object} entry
 * @returns {Object|null}
 */
export function normalizeFullModel(entry) {
  if (!entry || typeof entry.id !== "string" || !entry.id) return null;

  const inputModalities = entry.architecture?.input_modalities || [];
  const supportedParameters = Array.isArray(entry.supported_parameters)
    ? entry.supported_parameters
    : [];
  const reasoningMeta =
    entry.reasoning && typeof entry.reasoning === "object"
      ? entry.reasoning
      : null;

  let reasoning;
  if (
    reasoningMeta &&
    (reasoningMeta.mandatory === true ||
      reasoningMeta.default_enabled !== undefined ||
      Array.isArray(reasoningMeta.supported_efforts))
  ) {
    reasoning = {
      supported: true,
      toggleable: !reasoningMeta.mandatory,
      defaultEnabled: reasoningMeta.default_enabled !== false,
      ...(Array.isArray(reasoningMeta.supported_efforts) &&
      reasoningMeta.supported_efforts.length > 0
        ? {
            effort: {
              levels: reasoningMeta.supported_efforts,
              default: reasoningMeta.default_effort || "default",
            },
          }
        : {}),
    };
  } else if (supportedParameters.includes("reasoning")) {
    reasoning = { supported: true, toggleable: true };
  } else {
    reasoning = { supported: false };
  }

  const description =
    typeof entry.description === "string"
      ? entry.description.slice(0, 300)
      : "";

  return {
    id: entry.id,
    name:
      typeof entry.name === "string" && entry.name
        ? entry.name
        : entry.id,
    description,
    vision: inputModalities.includes("image"),
    tool_use: supportedParameters.includes("tools"),
    reasoning,
    _fullList: true,
  };
}

let hcFullModelsInflight = null;

/**
 * Removes duplicate model IDs (defensive: upstream catalogs occasionally
 * contain the same id twice).
 * @param {Array} models
 * @returns {Array}
 */
export function dedupeModelsById(models) {
  const seen = new Set();
  return models.filter((m) => {
    if (!m || !m.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

/**
 * Fetches the complete Hack Club model catalog through the /api/models
 * relay (which attaches auth + validates the upstream) and normalizes it.
 * Concurrent calls share one in-flight promise.
 *
 * @param {Object} [options]
 * @param {string} [options.apiKey]  Hack Club AI key (BYOK).
 * @param {boolean} [options.force]  Bypass cache.
 * @returns {Promise<Array>} Normalized model objects.
 */
export async function fetchHcFullModels({ apiKey, force = false } = {}) {
  if (!force && hcFullModels.length > 0) return hcFullModels;
  if (hcFullModelsInflight) return hcFullModelsInflight;

  hcFullModelsInflight = (async () => {
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": await getSessionToken(),
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ baseUrl: HACKCLUB_BASE_URL }),
      });
      if (!response.ok) {
        let message = `Model list request failed (${response.status})`;
        try {
          const err = await response.json();
          if (err?.statusMessage || err?.message) {
            message = err.statusMessage || err.message;
          }
        } catch {
          // keep generic message
        }
        throw new Error(message);
      }

      const data = await response.json();
      const raw = Array.isArray(data?.data) ? data.data : [];

      const normalized = dedupeModelsById(
        raw.map(normalizeFullModel).filter(Boolean),
      );

      hcFullModels.length = 0;
      hcFullModels.push(...normalized);
      persistHcFullModels();
      return hcFullModels;
    } finally {
      hcFullModelsInflight = null;
    }
  })();

  return hcFullModelsInflight;
}

/** True once the full catalog has been fetched at least once. */
export function hasHcFullModels() {
  return hcFullModels.length > 0;
}

/**
 * Finds a model in the full Hack Club catalog by plain ID.
 */
export function findFullModelById(id) {
  if (!id) return null;
  return hcFullModels.find((m) => m.id === id) || null;
}
