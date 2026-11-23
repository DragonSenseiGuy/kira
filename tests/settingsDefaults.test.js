import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map();
vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(async (key) => store.get(key) ?? null),
    setItem: vi.fn(async (key, value) => { store.set(key, value); }),
    removeItem: vi.fn(async (key) => { store.delete(key); }),
  },
}));

import Settings from "~/composables/settings";

describe("Settings defaults", () => {
  beforeEach(() => store.clear());

  it("keeps the shipped defaults intact after loading saved settings", async () => {
    store.set("settings", {
      keybinds: { new_chat: "mod+shift+y" },
      favorite_models: { "some/model": true },
    });
    const manager = new Settings();
    await manager.loadSettings();

    expect(manager.settings.keybinds.new_chat).toBe("mod+shift+y");
    expect(manager.defaultSettings.keybinds.new_chat).toBe("mod+alt+n");
    expect(manager.defaultSettings.favorite_models).toEqual({});
  });

  it("resets nested settings to the shipped defaults", async () => {
    store.set("settings", { keybinds: { new_chat: "mod+shift+y" } });
    const manager = new Settings();
    await manager.loadSettings();
    await manager.resetSettings();

    expect(manager.settings.keybinds.new_chat).toBe("mod+alt+n");
  });
});
