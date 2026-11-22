import { describe, it, expect } from "vitest";
import { loadPinnedExpanded, savePinnedExpanded } from "~/utils/pinnedSection";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    size: () => data.size,
  };
}

const broken = {
  getItem() { throw new Error("denied"); },
  setItem() { throw new Error("denied"); },
  removeItem() { throw new Error("denied"); },
};

describe("pinned section state", () => {
  it("is open by default", () => {
    expect(loadPinnedExpanded(memoryStorage())).toBe(true);
  });

  it("remembers being collapsed", () => {
    const storage = memoryStorage();
    savePinnedExpanded(false, storage);
    expect(loadPinnedExpanded(storage)).toBe(false);
  });

  it("forgets the choice once opened again", () => {
    const storage = memoryStorage();
    savePinnedExpanded(false, storage);
    savePinnedExpanded(true, storage);
    expect(loadPinnedExpanded(storage)).toBe(true);
    expect(storage.size()).toBe(0);
  });

  it("stays open when the browser refuses access to localStorage itself", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("SecurityError"); },
    });
    try {
      expect(loadPinnedExpanded()).toBe(true);
      expect(() => savePinnedExpanded(false)).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else delete globalThis.localStorage;
    }
  });

  it("stays open and does not throw when storage is unavailable", () => {
    expect(loadPinnedExpanded(broken)).toBe(true);
    expect(() => savePinnedExpanded(false, broken)).not.toThrow();
  });
});
