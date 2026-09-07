/**
 * Tests for app/composables/useDock.js — the right-hand dock model.
 *
 * The property that matters: availability is part of the model, not a gate
 * bolted onto each reader. An unavailable dock reads as closed, so nothing
 * has to remember to close it when its predicate flips.
 */

import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { useDock } from "../app/composables/useDock";

function setup(devMode = ref(true)) {
  return {
    devMode,
    ...useDock({ parameters: () => devMode.value, workspace: () => true }),
  };
}

describe("useDock", () => {
  it("opens and closes a dock by toggling the same id", () => {
    const { openDock, toggleDock } = setup();
    toggleDock("workspace");
    expect(openDock.value).toBe("workspace");
    toggleDock("workspace");
    expect(openDock.value).toBe(null);
  });

  it("is mutually exclusive: opening one replaces the other", () => {
    const { openDock, toggleDock } = setup();
    toggleDock("workspace");
    toggleDock("parameters");
    expect(openDock.value).toBe("parameters");
  });

  it("reads an unavailable dock as closed without anyone closing it", () => {
    const devMode = ref(true);
    const { openDock, toggleDock } = setup(devMode);
    toggleDock("parameters");
    expect(openDock.value).toBe("parameters");

    devMode.value = false;
    expect(openDock.value).toBe(null);
  });

  it("ignores an attempt to open an unavailable dock", () => {
    const { openDock, toggleDock } = setup(ref(false));
    toggleDock("parameters");
    expect(openDock.value).toBe(null);
  });

  it("does not spring an unavailable dock open when it becomes available", () => {
    // An inert shortcut must not leave a value behind that appears later.
    const devMode = ref(false);
    const { openDock, toggleDock } = setup(devMode);
    toggleDock("parameters");
    devMode.value = true;
    expect(openDock.value).toBe(null);
  });

  it("closeDock clears whatever is open", () => {
    const { openDock, toggleDock, closeDock } = setup();
    toggleDock("workspace");
    closeDock();
    expect(openDock.value).toBe(null);
  });
});
