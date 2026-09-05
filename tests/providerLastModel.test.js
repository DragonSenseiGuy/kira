/**
 * Reproduction test: provider_last_model should survive provider
 * switching — switching back to Hack Club must restore its "current"
 * model, not fall back to the default.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map() }));

vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => (store.has(key) ? structuredClone(store.get(key)) : null)),
    setItem: vi.fn(async (key, value) => {
      store.set(key, structuredClone(value));
      return value;
    }),
    removeItem: vi.fn(async (key) => {
      store.delete(key);
    }),
    config: vi.fn(),
  },
}));

vi.mock("../app/composables/useSession", () => ({
  getSessionToken: vi.fn(async () => "test-session-token"),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

import { useSettings } from "../app/composables/useSettings.js";
import { useModelPicker } from "../app/composables/useModelPicker.js";
import {
  customProviderModels,
  hcFullModels,
} from "../app/composables/providers.js";

const CATALOG = {
  data: [
    { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6" },
    { id: "deepseek/deepseek-v4-flash-vision-exp", name: "DeepSeek Vision" },
    { id: "stealth/ox-alpha", name: "Ox Alpha" },
  ],
};

async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("provider_last_model round-trip", () => {
  beforeEach(() => {
    store.clear();
    fetchMock.mockReset();
    // /api/models relay → full catalog
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => CATALOG,
    }));
    delete customProviderModels["pr_groq"];
  });

  it("remembers Hack Club's current model across provider switches", async () => {
    const settingsManager = useSettings();
    await waitFor(() => settingsManager.isLoaded);

    // Seed a custom provider so we can switch away and back.
    settingsManager.settings.custom_providers.push({
      id: "pr_groq",
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "gk",
    });
    customProviderModels["pr_groq"] = [{ id: "llama-3" }];

    const picker = useModelPicker();
    await picker.ensureCatalogLoaded();

    // 1. On Hack Club, the user picks a model.
    picker.selectModel("deepseek/deepseek-v4-flash-vision-exp");
    expect(settingsManager.settings.selected_model_id).toBe(
      "deepseek/deepseek-v4-flash-vision-exp",
    );
    expect(settingsManager.settings.provider_last_model.hackclub).toBe(
      "deepseek/deepseek-v4-flash-vision-exp",
    );

    // 2. Switch to Groq → its first model becomes current.
    await picker.switchProvider("pr_groq");
    expect(settingsManager.settings.selected_model_id).toBe("pr_groq::llama-3");

    // 3. Switch BACK to Hack Club → its remembered model must be restored.
    await picker.switchProvider("hackclub");
    expect(settingsManager.settings.selected_model_id).toBe(
      "deepseek/deepseek-v4-flash-vision-exp",
    );
  });

  it("survives a settings save/reload round-trip", async () => {
    const settingsManager = useSettings();
    await waitFor(() => settingsManager.isLoaded);

    settingsManager.settings.provider_last_model.hackclub =
      "stealth/ox-alpha";
    await settingsManager.saveSettings();

    // Simulate app restart: reload from storage into the same singleton.
    settingsManager.isLoaded = false;
    await settingsManager.loadSettings();

    expect(settingsManager.settings.provider_last_model.hackclub).toBe(
      "stealth/ox-alpha",
    );
  });
});
