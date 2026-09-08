/**
 * Tests for app/composables/useDialogs.js — the in-app replacement for
 * window.alert/confirm/prompt.
 *
 * Covers:
 *   - Resolution values: confirm → boolean, prompt → trimmed string or null,
 *     alert → true
 *   - FIFO queueing: a request made while one is visible resolves only after
 *     the first is settled, and never leaks
 *   - settleDialog is a safe no-op with nothing visible
 *
 * The module is a singleton, so each test fully drains any visible dialog
 * before the next one starts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  alertDialog,
  confirmDialog,
  promptDialog,
  useDialogState,
  settleDialog,
} from "../app/composables/useDialogs";

const state = useDialogState();

/** Drains any visible dialog(s) so tests stay isolated despite the singleton. */
function drain(value = false) {
  let guard = 0;
  while (state.current && guard++ < 10) settleDialog(value);
}

beforeEach(() => drain());

describe("dialog resolution values", () => {
  it("confirmDialog resolves true on confirm and false on cancel", async () => {
    const p = confirmDialog({ title: "Delete?" });
    settleDialog(true);
    await expect(p).resolves.toBe(true);

    const q = confirmDialog({});
    settleDialog(false);
    await expect(q).resolves.toBe(false);
  });

  it("promptDialog resolves whatever the host settles (trimming is the host's job)", async () => {
    const p = promptDialog({ initial: "draft.md" });
    settleDialog("  final.md  ");
    await expect(p).resolves.toBe("  final.md  ");

    const q = promptDialog({});
    settleDialog(null);
    await expect(q).resolves.toBeNull();
  });

  it("alertDialog resolves true regardless", async () => {
    const p = alertDialog({ title: "Boom", message: "It failed." });
    settleDialog(true);
    await expect(p).resolves.toBe(true);
  });
});

describe("dialog configuration", () => {
  it("exposes the config on state.current for the host to render", () => {
    confirmDialog({
      title: "Delete file",
      message: "Are you sure?",
      confirmLabel: "Delete",
      danger: true,
    });

    expect(state.current).toMatchObject({
      kind: "confirm",
      title: "Delete file",
      message: "Are you sure?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
    });
    drain();
  });

  it("promptDialog carries initial value and placeholder", () => {
    promptDialog({ title: "Rename", initial: "old.md", placeholder: "New name" });

    expect(state.current).toMatchObject({
      kind: "prompt",
      title: "Rename",
      initial: "old.md",
      placeholder: "New name",
    });
    drain();
  });

  it("applies defaults for omitted fields", () => {
    alertDialog();

    expect(state.current).toMatchObject({
      kind: "alert",
      title: "Notice",
      confirmLabel: "OK",
    });
    drain();
  });
});

describe("queueing", () => {
  it("queues a second request and resolves it after the first settles", async () => {
    const first = confirmDialog({ title: "First" });
    const second = promptDialog({ title: "Second" });

    // First is visible; second is waiting.
    expect(state.current.title).toBe("First");

    settleDialog(true);
    await expect(first).resolves.toBe(true);

    // The queued dialog is now visible.
    expect(state.current.title).toBe("Second");
    settleDialog("done");
    await expect(second).resolves.toBe("done");
    expect(state.current).toBeNull();
  });

  it("preserves FIFO order for three requests", async () => {
    const a = confirmDialog({ title: "A" });
    const b = alertDialog({ title: "B" });
    const c = promptDialog({ title: "C" });

    settleDialog(false);
    settleDialog(true);
    settleDialog("x");

    await expect(a).resolves.toBe(false);
    await expect(b).resolves.toBe(true);
    await expect(c).resolves.toBe("x");
  });

  it("settling with no visible dialog is a safe no-op", () => {
    expect(() => settleDialog(true)).not.toThrow();
    expect(state.current).toBeNull();
  });
});
