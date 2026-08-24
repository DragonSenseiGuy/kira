/**
 * Tests for app/composables/pendingChatSetup.js — the new-chat staging area.
 *
 * Covers:
 *   - Staging projects/files and removing them (module singleton semantics)
 *   - applyPendingSetup: consumes the snapshot atomically, records project
 *     attachments, writes files into data/, skips oversized files, emits
 *     workspace-changed
 *   - No-op behavior when nothing is staged
 *
 * Storage and scope resolution are mocked — this layer only orchestrates.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// pendingChatSetup resolves scope roots via workspaceSession and writes
// through utils/workspace. Stub both so no OPFS is touched.
vi.mock("../app/composables/workspaceSession", () => ({
  getChatRoot: vi.fn(async () => ({ __fakeRoot: true })),
}));

vi.mock("../app/utils/workspace", () => ({
  workspaceWrite: vi.fn(async () => ({})),
}));

import { getChatRoot } from "../app/composables/workspaceSession";
import { workspaceWrite } from "../app/utils/workspace";
import {
  stageProject,
  unstageProject,
  toggleProject,
  stageFiles,
  removeFile,
  hasPending,
  clearPendingSetup,
  applyPendingSetup,
} from "../app/composables/pendingChatSetup";

function fakeSettingsManager() {
  return {
    settings: { project_attachments: {} },
    saveSettings: vi.fn(),
  };
}

function fakeFile(name, size = 10) {
  return { name, size, text: async () => `content-of-${name}` };
}

beforeEach(() => {
  clearPendingSetup();
  vi.mocked(workspaceWrite).mockClear();
  vi.mocked(getChatRoot).mockClear();
});

describe("staging state", () => {
  it("starts empty", () => {
    expect(hasPending()).toBe(false);
  });

  it("stages and unstages projects without duplicates", () => {
    stageProject("alpha");
    stageProject("alpha");
    stageProject("beta");
    expect(hasPending()).toBe(true);
    unstageProject("alpha");
    toggleProject("beta"); // toggle off
    expect(hasPending()).toBe(false);
  });

  it("toggleProject adds then removes", () => {
    toggleProject("x");
    expect(hasPending()).toBe(true);
    toggleProject("x");
    expect(hasPending()).toBe(false);
  });

  it("stages files with unique ids and removes by id", () => {
    stageFiles([fakeFile("a.csv"), fakeFile("b.csv")]);
    stageFiles([fakeFile("c.csv")]);
    expect(hasPending()).toBe(true);
    removeFile("staged-1");
    removeFile("staged-2");
    expect(hasPending()).toBe(true); // c.csv remains
    removeFile("staged-3");
    expect(hasPending()).toBe(false);
  });

  it("clearPendingSetup wipes everything", () => {
    stageProject("p");
    stageFiles([fakeFile("f.txt")]);
    clearPendingSetup();
    expect(hasPending()).toBe(false);
  });
});

describe("applyPendingSetup", () => {
  it("is a no-op with nothing staged", async () => {
    const sm = fakeSettingsManager();
    await expect(applyPendingSetup("convo1", sm)).resolves.toBe(false);
    expect(sm.saveSettings).not.toHaveBeenCalled();
    expect(workspaceWrite).not.toHaveBeenCalled();
  });

  it("records staged projects as attachments for the new conversation", async () => {
    stageProject("radar");
    stageProject("cleanup");
    const sm = fakeSettingsManager();

    await applyPendingSetup("convo1", sm);

    expect(sm.settings.project_attachments.convo1).toEqual(["radar", "cleanup"]);
    expect(sm.saveSettings).toHaveBeenCalled();
  });

  it("appends to existing attachments without duplicating", async () => {
    const sm = fakeSettingsManager();
    sm.settings.project_attachments.convo1 = ["existing"];

    stageProject("existing");
    stageProject("fresh");
    await applyPendingSetup("convo1", sm);

    expect(sm.settings.project_attachments.convo1).toEqual(["existing", "fresh"]);
  });

  it("writes staged files into the chat's data/ folder", async () => {
    stageFiles([fakeFile("words.csv", 20)]);
    const sm = fakeSettingsManager();

    await applyPendingSetup("convo2", sm);

    expect(getChatRoot).toHaveBeenCalledWith("convo2");
    expect(workspaceWrite).toHaveBeenCalledTimes(1);
    const [path, content] = vi.mocked(workspaceWrite).mock.calls[0];
    expect(path).toBe("data/words.csv");
    expect(content).toBe("content-of-words.csv");
  });

  it("skips oversized files but still applies the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stageFiles([fakeFile("huge.bin", 6 * 1024 * 1024), fakeFile("ok.txt")]);
    const sm = fakeSettingsManager();

    await applyPendingSetup("convo3", sm);

    expect(workspaceWrite).toHaveBeenCalledTimes(1);
    expect(vi.mocked(workspaceWrite).mock.calls[0][0]).toBe("data/ok.txt");
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("huge.bin"),
    );
    warn.mockRestore();
  });

  it("consumes the snapshot: a second apply is a no-op", async () => {
    stageProject("once");
    const sm = fakeSettingsManager();

    await applyPendingSetup("convoA", sm);
    const second = await applyPendingSetup("convoB", sm);

    expect(second).toBe(false);
    expect(sm.settings.project_attachments.convoB).toBeUndefined();
    expect(hasPending()).toBe(false);
  });
});
