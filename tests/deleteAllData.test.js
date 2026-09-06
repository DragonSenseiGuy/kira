/**
 * Tests for app/composables/deleteAllData.js — the Settings → Data
 * "Delete data" action.
 *
 * The contract that matters: every store is emptied, the account copies go
 * too (otherwise the next sign-in re-hydrates "deleted" chats), the sign-in
 * session survives, one unavailable local store does not abort the rest —
 * and a failed account delete stops the whole thing before the local copy
 * (the only way to retry) is destroyed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const cloudDeleteConversation = vi.fn();

vi.mock("localforage", () => ({
  default: {
    getItem: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("../app/utils/workspace", () => ({
  getDefaultRoot: vi.fn(),
  removeChildEntry: vi.fn(),
}));

vi.mock("../app/composables/useCloudSync", () => ({
  useCloudSync: () => ({ cloudDeleteConversation }),
}));

import localforage from "localforage";
import { getDefaultRoot, removeChildEntry } from "../app/utils/workspace";
import { deleteAllData } from "../app/composables/deleteAllData";

const SESSION_KEY = "__kira_session_v1";

beforeEach(() => {
  vi.clearAllMocks();
  // The real composable resolves true when the account no longer holds the
  // conversation — including when there is no account at all.
  cloudDeleteConversation.mockResolvedValue(true);
  vi.mocked(localforage.getItem).mockResolvedValue([
    { id: "chat-a" },
    { id: "chat-b" },
  ]);
  vi.mocked(localforage.clear).mockResolvedValue(undefined);
  vi.mocked(getDefaultRoot).mockResolvedValue({ name: "root" });
  vi.mocked(removeChildEntry).mockResolvedValue(true);

  window.localStorage.clear();
  window.localStorage.setItem(SESSION_KEY, "token");
  window.localStorage.setItem("libre-hc-full-models", "[]");
  window.localStorage.setItem("vueuse-color-scheme", "dark");
});

describe("deleteAllData", () => {
  it("clears the local database", async () => {
    await deleteAllData();
    expect(localforage.clear).toHaveBeenCalled();
  });

  it("deletes the account's copy of every conversation", async () => {
    await deleteAllData();
    expect(cloudDeleteConversation).toHaveBeenCalledWith("chat-a");
    expect(cloudDeleteConversation).toHaveBeenCalledWith("chat-b");
  });

  it("removes both workspace trees", async () => {
    await deleteAllData();
    const dirs = vi.mocked(removeChildEntry).mock.calls.map((c) => c[1]);
    expect(dirs).toEqual(["chats", "projects"]);
  });

  it("clears cached preferences but keeps the sign-in session", async () => {
    await deleteAllData();
    expect(window.localStorage.getItem("libre-hc-full-models")).toBeNull();
    expect(window.localStorage.getItem("vueuse-color-scheme")).toBeNull();
    expect(window.localStorage.getItem(SESSION_KEY)).toBe("token");
  });

  it("deletes the account's conversations concurrently", async () => {
    let inFlight = 0;
    let peak = 0;
    cloudDeleteConversation.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return true;
    });

    await deleteAllData();

    expect(peak).toBe(2);
  });

  it("keeps the local copy when an account delete fails, so it can be retried", async () => {
    cloudDeleteConversation.mockImplementation(async (id) => id !== "chat-b");

    const { errors } = await deleteAllData();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("chat-b");
    // The metadata holding the ids is the only way to retry — it must survive.
    expect(localforage.clear).not.toHaveBeenCalled();
    expect(removeChildEntry).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("libre-hc-full-models")).toBe("[]");
  });

  it("stops before the local wipe when the account step throws", async () => {
    cloudDeleteConversation.mockRejectedValue(new Error("network down"));

    const { errors } = await deleteAllData();

    expect(errors).toHaveLength(1);
    expect(localforage.clear).not.toHaveBeenCalled();
  });

  it("reports a failing store without abandoning the others", async () => {
    vi.mocked(getDefaultRoot).mockRejectedValue(new Error("no OPFS here"));

    const { errors } = await deleteAllData();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("no OPFS here");
    expect(localforage.clear).toHaveBeenCalled();
    expect(window.localStorage.getItem("libre-hc-full-models")).toBeNull();
  });

  it("succeeds with no errors when every store cooperates", async () => {
    const { errors } = await deleteAllData();
    expect(errors).toEqual([]);
  });
});
