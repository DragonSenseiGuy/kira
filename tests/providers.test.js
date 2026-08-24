/**
 * Tests for app/composables/providers.js — multi-provider support.
 *
 * Covers the pure logic that everything else builds on:
 *   - composite model ID build/parse round-trips
 *   - chat target resolution (Hack Club vs custom vs deleted provider)
 *   - background credential fallbacks
 *   - model-ID validity checks used to protect the user's selection
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  HACKCLUB_PROVIDER_ID,
  PRESET_PROVIDERS,
  PROVIDER_ID_SEPARATOR,
  buildCustomModelId,
  parseCustomModelId,
  generateProviderId,
  findCustomProvider,
  resolveChatTarget,
  resolveCompletionCredentials,
  isKnownModelId,
  normalizeFullModel,
  getConfiguredProviders,
  getActiveProviderId,
  getActiveProviderModelGroups,
  pickModelForProvider,
  getFavoriteModelIds,
  getFavoriteModels,
  toggleFavoriteModel,
  isFavoriteModel,
  isLocalBaseUrl,
  customProviderModels,
  hcFullModels,
  HACKCLUB_DEFAULT_MODEL_ID,
} from "../app/composables/providers.js";

describe("composite model IDs", () => {
  it("builds and parses round-trip", () => {
    const id = buildCustomModelId("pr_abc", "deepseek/deepseek-chat");
    expect(id).toBe(`pr_abc${PROVIDER_ID_SEPARATOR}deepseek/deepseek-chat`);

    const parsed = parseCustomModelId(id);
    expect(parsed).toEqual({ providerId: "pr_abc", modelId: "deepseek/deepseek-chat" });
  });

  it("treats plain Hack Club model IDs as non-composite", () => {
    expect(parseCustomModelId("anthropic/claude-sonnet-5")).toBeNull();
    expect(parseCustomModelId("")).toBeNull();
    expect(parseCustomModelId(null)).toBeNull();
    expect(parseCustomModelId(undefined)).toBeNull();
  });

  it("rejects malformed composites", () => {
    expect(parseCustomModelId(`${PROVIDER_ID_SEPARATOR}model`)).toBeNull();
    expect(parseCustomModelId(`provider${PROVIDER_ID_SEPARATOR}`)).toBeNull();
  });

  it("generates unique provider ids", () => {
    const a = generateProviderId();
    const b = generateProviderId();
    expect(a).not.toBe(b);
    expect(a.startsWith("pr_")).toBe(true);
  });
});

describe("PRESET_PROVIDERS", () => {
  it("has unique ids and valid https URLs (except local presets)", () => {
    const ids = PRESET_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const preset of PRESET_PROVIDERS) {
      if (preset.baseUrl.includes("localhost")) continue;
      expect(preset.baseUrl.startsWith("https://")).toBe(true);
      expect(preset.name).toBeTruthy();
    }
  });

  it("marks Ollama/LM Studio presets as local", () => {
    const localPresets = PRESET_PROVIDERS.filter((p) => p.local);
    expect(localPresets.map((p) => p.id)).toEqual(
      expect.arrayContaining(["ollama-local", "lmstudio-local"]),
    );
    for (const preset of localPresets) {
      expect(isLocalBaseUrl(preset.baseUrl)).toBe(true);
    }
  });
});

describe("isLocalBaseUrl", () => {
  it("detects loopback endpoints in common shapes", () => {
    expect(isLocalBaseUrl("http://localhost:11434/v1")).toBe(true);
    expect(isLocalBaseUrl("http://127.0.0.1:1234/v1")).toBe(true);
    expect(isLocalBaseUrl("http://[::1]:11434/v1")).toBe(true);
    expect(isLocalBaseUrl("http://myapp.localhost:8080/v1")).toBe(true);
  });

  it("rejects remote and junk values", () => {
    expect(isLocalBaseUrl("https://api.groq.com/openai/v1")).toBe(false);
    expect(isLocalBaseUrl("http://192.168.1.10:11434/v1")).toBe(false); // LAN ≠ this machine
    expect(isLocalBaseUrl("not a url")).toBe(false);
    expect(isLocalBaseUrl("")).toBe(false);
    expect(isLocalBaseUrl(null)).toBe(false);
  });
});

const HC_SETTINGS = {
  selected_model_id: "openai/gpt-5.6-luna",
  custom_api_key: "hc-key",
  custom_providers: [],
};

describe("resolveChatTarget", () => {
  it("routes plain model IDs to the Hack Club provider", () => {
    const target = resolveChatTarget(HC_SETTINGS);
    expect(target.providerId).toBe(HACKCLUB_PROVIDER_ID);
    expect(target.modelId).toBe("openai/gpt-5.6-luna");
    expect(target.apiKey).toBe("hc-key");
    expect(target.upstreamBaseUrl).toBeNull();
  });

  it("routes composite IDs to their custom provider", () => {
    const settings = {
      selected_model_id: buildCustomModelId("pr_x", "some-model"),
      custom_api_key: "hc-key",
      custom_providers: [
        { id: "pr_x", name: "Mine", baseUrl: "https://api.mine.dev/v1", apiKey: "sk-mine" },
      ],
    };
    const target = resolveChatTarget(settings);
    expect(target.providerId).toBe("pr_x");
    expect(target.modelId).toBe("some-model");
    expect(target.apiKey).toBe("sk-mine");
    expect(target.upstreamBaseUrl).toBe("https://api.mine.dev/v1");
  });

  it("falls back to Hack Club when the selected provider was removed", () => {
    const settings = {
      selected_model_id: buildCustomModelId("pr_gone", "some-model"),
      custom_api_key: "hc-key",
      custom_providers: [],
    };
    const target = resolveChatTarget(settings);
    expect(target.providerId).toBe(HACKCLUB_PROVIDER_ID);
    expect(target.apiKey).toBe("hc-key");
    expect(target.upstreamBaseUrl).toBeNull();
  });

  it("returns an empty key when none is configured", () => {
    const target = resolveChatTarget({
      selected_model_id: "openai/gpt-5.6-luna",
      custom_api_key: "",
      custom_providers: [],
    });
    expect(target.apiKey).toBe("");
  });
});

describe("findCustomProvider", () => {
  it("finds providers and tolerates missing arrays", () => {
    const settings = { custom_providers: [{ id: "a" }] };
    expect(findCustomProvider(settings, "a")?.id).toBe("a");
    expect(findCustomProvider(settings, "b")).toBeNull();
    expect(findCustomProvider({}, "a")).toBeNull();
    expect(findCustomProvider(null, "a")).toBeNull();
  });
});

describe("resolveCompletionCredentials", () => {
  it("prefers an explicit key", () => {
    const creds = resolveCompletionCredentials(
      { custom_api_key: "x", custom_providers: [{ id: "p", apiKey: "k", baseUrl: "https://a" }] },
      "explicit",
    );
    expect(creds).toEqual({ customApiKey: "explicit" });
  });

  it("falls back to the first keyed custom provider", () => {
    const creds = resolveCompletionCredentials({
      custom_api_key: "",
      custom_providers: [
        { id: "nokey", apiKey: "", baseUrl: "https://a" },
        { id: "yeskey", apiKey: "sk-2", baseUrl: "https://b/v1" },
      ],
    });
    expect(creds).toEqual({
      customApiKey: "sk-2",
      upstreamBaseUrl: "https://b/v1",
    });
  });

  it("then falls back to the Hack Club key", () => {
    expect(resolveCompletionCredentials({ custom_api_key: "hc", custom_providers: [] })).toEqual({
      customApiKey: "hc",
    });
  });

  it("returns empty when nothing is configured", () => {
    expect(resolveCompletionCredentials({})).toEqual({});
    expect(resolveCompletionCredentials(null)).toEqual({});
  });
});

describe("isKnownModelId", () => {
  const lookup = (id) =>
    ["known/model"].includes(id)
      ? { id }
      : null;

  it("uses the catalog lookup for plain IDs", () => {
    expect(isKnownModelId({}, "known/model", lookup)).toBe(true);
    expect(isKnownModelId({}, "unknown", lookup)).toBe(false);
  });

  it("accepts composite IDs whose provider exists even without models fetched", () => {
    const settings = { custom_providers: [{ id: "pr_1" }] };
    expect(isKnownModelId(settings, `pr_1${PROVIDER_ID_SEPARATOR}anything`, lookup)).toBe(true);
  });

  it("rejects composite IDs whose provider is gone", () => {
    expect(isKnownModelId({}, `pr_gone${PROVIDER_ID_SEPARATOR}m`, lookup)).toBe(false);
  });
});

// --- Full Hack Club / OpenRouter catalog ("show all models") ---

const SAMPLE_OPENROUTER_ENTRY = {
  id: "deepseek/deepseek-v4-flash-vision-exp",
  name: "DeepSeek: DeepSeek V4 Flash Vision Exp",
  description: "Experimental vision-enabled version of DeepSeek V4 Flash.",
  context_length: 1048576,
  architecture: {
    modality: "text+image->text",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  pricing: { prompt: "0.00000022", completion: "0.00000066" },
  supported_parameters: [
    "frequency_penalty",
    "max_tokens",
    "reasoning",
    "reasoning_effort",
    "temperature",
    "tool_choice",
    "tools",
    "top_p",
  ],
  reasoning: {
    mandatory: false,
    default_enabled: true,
    supported_efforts: ["max", "high", "low"],
    default_effort: "high",
  },
};

describe("normalizeFullModel", () => {
  it("maps a full OpenRouter-style entry into selector shape", () => {
    const m = normalizeFullModel(SAMPLE_OPENROUTER_ENTRY);

    expect(m.id).toBe(SAMPLE_OPENROUTER_ENTRY.id);
    expect(m.name).toBe("DeepSeek: DeepSeek V4 Flash Vision Exp");
    expect(m.vision).toBe(true); // input_modalities includes image
    expect(m.tool_use).toBe(true); // supported_parameters includes tools
    expect(m.reasoning).toEqual({
      supported: true,
      toggleable: true, // mandatory: false
      defaultEnabled: true,
      effort: { levels: ["max", "high", "low"], default: "high" },
    });
    expect(m._fullList).toBe(true);
  });

  it("marks mandatory-reasoning models as non-toggleable", () => {
    const m = normalizeFullModel({
      ...SAMPLE_OPENROUTER_ENTRY,
      reasoning: { mandatory: true, default_enabled: true, supported_efforts: ["max"], default_effort: "max" },
    });
    expect(m.reasoning.toggleable).toBe(false);
    expect(m.reasoning.effort.levels).toEqual(["max"]);
  });

  it("falls back to basic reasoning support when only the parameter is advertised", () => {
    const m = normalizeFullModel({
      id: "x/y",
      supported_parameters: ["temperature", "reasoning"],
    });
    expect(m.reasoning).toEqual({ supported: true, toggleable: true });
    expect(m.name).toBe("x/y"); // name falls back to ID
  });

  it("marks text-only, non-tool models conservatively", () => {
    const m = normalizeFullModel({
      id: "tencent/hy-mt2-1.8b",
      name: "Tencent: Hy-MT2-1.8B",
      architecture: { input_modalities: ["text"] },
      supported_parameters: ["max_tokens", "stop", "temperature"],
    });
    expect(m.vision).toBe(false);
    expect(m.tool_use).toBe(false);
    expect(m.reasoning.supported).toBe(false);
  });

  it("returns null for junk entries", () => {
    expect(normalizeFullModel(null)).toBeNull();
    expect(normalizeFullModel({})).toBeNull();
    expect(normalizeFullModel({ id: "" })).toBeNull();
  });
});

describe("buildAllModelGroups", () => {
  beforeEach(() => {
    hcFullModels.length = 0;
    for (const key of Object.keys(customProviderModels)) {
      delete customProviderModels[key];
    }
  });

  const curated = [
    {
      category: "Anthropic",
      logo: "/logos/anthropic.svg",
      models: [{ id: "anthropic/claude-fable-5", name: "Claude Fable 5" }],
    },
    { id: "standalone-model", name: "Standalone" },
  ];

  it("getConfiguredProviders lists Hack Club first (locked) plus customs", () => {
    const providers = getConfiguredProviders({
      custom_api_key: "hc",
      custom_providers: [{ id: "pr_a", name: "Groq", baseUrl: "https://x/v1", apiKey: "k" }],
    });
    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({
      id: HACKCLUB_PROVIDER_ID,
      name: "Hack Club AI",
      locked: true,
      apiKeySet: true,
    });
    expect(providers[1]).toMatchObject({ id: "pr_a", locked: false, apiKeySet: true });
  });

  it("active provider defaults to Hack Club and can be inferred from legacy composite selections", () => {
    expect(getActiveProviderId({ selected_model_id: "openai/gpt" })).toBe(HACKCLUB_PROVIDER_ID);
    expect(
      getActiveProviderId({
        selected_model_id: buildCustomModelId("pr_a", "m"),
        custom_providers: [{ id: "pr_a", name: "X", baseUrl: "https://x/v1" }],
      }),
    ).toBe("pr_a");
  });

  it("model groups are scoped to the ACTIVE provider only", () => {
    const settings = {
      active_provider_id: "pr_a",
      selected_model_id: buildCustomModelId("pr_a", "groq-model"),
      custom_providers: [
        { id: "pr_a", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "k" },
      ],
    };
    // Seed the fetched list for pr_a (as fetchProviderModels would).
    customProviderModels["pr_a"] = [{ id: "groq-model" }];

    const groups = getActiveProviderModelGroups(curated, settings);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("Groq");
    expect(groups[0]._providerId).toBe("pr_a");
    expect(groups[0].models.map((m) => m.id)).toEqual([buildCustomModelId("pr_a", "groq-model")]);

    delete customProviderModels["pr_a"];
  });

  it("Hack Club's model list is ALWAYS the full catalog (curated list retired)", () => {
    hcFullModels.push(
      { id: "stealth/ox-alpha", name: "Ox Alpha", _fullList: true },
    );
    const groups = getActiveProviderModelGroups(curated, {
      custom_providers: [],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]._fullCatalog).toBe(true);
    expect(groups[0].logo).toBeNull(); // NO logos for the full list
    expect(groups[0].models.map((m) => m.id)).toEqual(["stealth/ox-alpha"]);
  });

  it("returns an empty full-catalog group before the fetch completes", () => {
    const groups = getActiveProviderModelGroups(curated, { custom_providers: [] });
    expect(groups).toHaveLength(1);
    expect(groups[0]._fullCatalog).toBe(true);
    expect(groups[0].models).toEqual([]);
  });

  it("favorites are stored per provider and toggled", () => {
    const settings = { favorite_models: {} };

    expect(getFavoriteModelIds(settings, HACKCLUB_PROVIDER_ID)).toEqual([]);

    expect(toggleFavoriteModel(settings, HACKCLUB_PROVIDER_ID, "a/model")).toBe(true);
    expect(toggleFavoriteModel(settings, "pr_x", "b/model")).toBe(true);
    expect(getFavoriteModelIds(settings, HACKCLUB_PROVIDER_ID)).toEqual(["a/model"]);
    expect(getFavoriteModelIds(settings, "pr_x")).toEqual(["b/model"]);

    // Toggling again removes it.
    expect(toggleFavoriteModel(settings, HACKCLUB_PROVIDER_ID, "a/model")).toBe(false);
    expect(getFavoriteModelIds(settings, HACKCLUB_PROVIDER_ID)).toEqual([]);

    expect(isFavoriteModel(settings, "pr_x", "b/model")).toBe(true);
    expect(isFavoriteModel(settings, "pr_x", "nope")).toBe(false);
  });

  it("getFavoriteModels resolves to catalog entries and skips missing ones", () => {
    hcFullModels.push({ id: "stealth/ox-alpha", name: "Ox Alpha" });
    const settings = { favorite_models: {} };
    toggleFavoriteModel(settings, HACKCLUB_PROVIDER_ID, "stealth/ox-alpha");
    toggleFavoriteModel(settings, HACKCLUB_PROVIDER_ID, "deleted/model");

    const favorites = getFavoriteModels(curated, settings, HACKCLUB_PROVIDER_ID);
    expect(favorites).toHaveLength(1);
    expect(favorites[0].id).toBe("stealth/ox-alpha");
  });

  it("pickModelForProvider restores the provider's last model, else its first", () => {
    hcFullModels.length = 0;
    const settings = {
      custom_providers: [
        {
          id: "pr_a",
          name: "Groq",
          baseUrl: "https://api.groq.com/openai/v1",
          apiKey: "k",
        },
      ],
      provider_last_model: {},
    };

    // Nothing cached for pr_a yet → no pick possible.
    expect(pickModelForProvider(curated, settings, "pr_a")).toBeNull();

    // Simulate a fetched model list by seeding the reactive cache via
    // the same shape fetchProviderModels would produce.
    customProviderModels["pr_a"] = [
      { id: "llama-3" },
      { id: "mixtral" },
    ];

    // First available model is chosen…
    expect(pickModelForProvider(curated, settings, "pr_a")).toBe(
      buildCustomModelId("pr_a", "llama-3"),
    );

    // …unless this provider has a remembered last model that still exists.
    settings.provider_last_model["pr_a"] = buildCustomModelId("pr_a", "mixtral");
    expect(pickModelForProvider(curated, settings, "pr_a")).toBe(
      buildCustomModelId("pr_a", "mixtral"),
    );
  });

  it("Hack Club falls back to its designated default model (never 'first of catalog')", () => {
    // The default ID is configurable (HACKCLUB_DEFAULT_MODEL_ID) — the
    // BEHAVIOR under test is that the fallback uses that designated
    // constant rather than hcFullModels[0].
    hcFullModels.length = 0;
    hcFullModels.push(
      { id: "aardvark/some-model", name: "Alphabetically first" },
      { id: HACKCLUB_DEFAULT_MODEL_ID, name: "Designated default" },
      { id: "deepseek/deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision Exp" },
    );
    expect(HACKCLUB_DEFAULT_MODEL_ID).not.toBe("aardvark/some-model"); // guard: fixture must differ from catalog[0]

    const settings = { provider_last_model: {} };

    // No remembered model → the designated default, NOT hcFullModels[0].
    expect(pickModelForProvider([], settings, HACKCLUB_PROVIDER_ID)).toBe(
      HACKCLUB_DEFAULT_MODEL_ID,
    );

    // A remembered ("current") model wins over the default…
    settings.provider_last_model[HACKCLUB_PROVIDER_ID] = "deepseek/deepseek-v4-flash-vision-exp";
    expect(pickModelForProvider([], settings, HACKCLUB_PROVIDER_ID)).toBe(
      "deepseek/deepseek-v4-flash-vision-exp",
    );

    // …but only while it still exists in the catalog.
    delete settings.provider_last_model[HACKCLUB_PROVIDER_ID];
    settings.provider_last_model[HACKCLUB_PROVIDER_ID] = "deleted/model";
    expect(pickModelForProvider([], settings, HACKCLUB_PROVIDER_ID)).toBe(
      HACKCLUB_DEFAULT_MODEL_ID,
    );
  });

  it("resolveChatTarget routes by ACTIVE provider (not just composite IDs)", () => {
    const settings = {
      active_provider_id: "pr_a",
      selected_model_id: "llama-3",
      custom_api_key: "hc-key",
      custom_providers: [
        { id: "pr_a", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "gk" },
      ],
    };
    expect(resolveChatTarget(settings)).toEqual({
      providerId: "pr_a",
      modelId: "llama-3",
      apiKey: "gk",
      upstreamBaseUrl: "https://api.groq.com/openai/v1",
      direct: false,
    });
  });

  it("resolveChatTarget flags loopback providers for DIRECT browser calls", () => {
    const settings = {
      active_provider_id: "pr_local",
      selected_model_id: "llama3",
      custom_providers: [
        {
          id: "pr_local",
          name: "Ollama",
          baseUrl: "http://localhost:11434/v1",
          apiKey: "",
        },
      ],
    };
    const target = resolveChatTarget(settings);
    expect(target.direct).toBe(true);
    expect(target.upstreamBaseUrl).toBe("http://localhost:11434/v1");
  });
});
