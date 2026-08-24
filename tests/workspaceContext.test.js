/**
 * Tests for app/composables/workspaceContext.js — compact workspace
 * descriptions injected into background prompts (compression, notepad).
 *
 * Storage and scope are mocked; assertions cover the generated context
 * blocks: file listing with project prefixes, manifest excerpt, caps, and
 * the empty/no-conversation cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockScope = vi.hoisted(() => ({ summary: null }));

vi.mock("../app/composables/workspaceSession", () => ({
  getScopeSummary: vi.fn(async () => mockScope.summary),
  getChatRoot: vi.fn(async () => ({ __chatRoot: true })),
  getProjectRoot: vi.fn(async () => ({ __projRoot: true })),
  listProjectNames: vi.fn(async () => ["radar", "cleanup"]),
}));

vi.mock("../app/utils/workspace", () => ({
  workspaceList: vi.fn(),
  workspaceRead: vi.fn(),
}));

import { workspaceList, workspaceRead } from "../app/utils/workspace";
import {
  collectWorkspaceContext,
  collectProjectNames,
} from "../app/composables/workspaceContext";

beforeEach(() => {
  vi.mocked(workspaceList).mockReset();
  vi.mocked(workspaceRead).mockReset();
  mockScope.summary = null;
});

describe("collectWorkspaceContext", () => {
  it("returns empty string with no active conversation", async () => {
    mockScope.summary = null;
    await expect(collectWorkspaceContext()).resolves.toBe("");
  });

  it("returns empty string when the workspace has no files", async () => {
    mockScope.summary = { convoId: "c1", attached: [] };
    vi.mocked(workspaceList).mockResolvedValue({ files: [], truncated: false });

    await expect(collectWorkspaceContext()).resolves.toBe("");
    expect(workspaceRead).not.toHaveBeenCalled();
  });

  it("lists chat files and prefixes attached project files", async () => {
    mockScope.summary = { convoId: "c1", attached: ["radar"] };
    vi.mocked(workspaceList).mockImplementation(async (_rel, root) => ({
      files: root?.__projRoot
        ? [{ path: "data/watchlist.json" }]
        : [{ path: "notes.md" }, { path: "WORKSPACE.md" }],
      truncated: false,
    }));
    vi.mocked(workspaceRead).mockResolvedValue({ content: "# Manifest\n- keep notes current" });

    const ctx = await collectWorkspaceContext();

    expect(ctx).toContain("<workspace_files>");
    expect(ctx).toContain("- notes.md");
    expect(ctx).toContain("- projects/radar/data/watchlist.json");
    // Manifest is included as an excerpt.
    expect(ctx).toContain("<workspace_manifest>");
    expect(ctx).toContain("keep notes current");
  });

  it("caps the file listing and reports the remainder", async () => {
    mockScope.summary = { convoId: "c1", attached: [] };
    const many = Array.from({ length: 60 }, (_, i) => ({ path: `f${i}.txt` }));
    vi.mocked(workspaceList).mockResolvedValue({ files: many, truncated: false });

    const ctx = await collectWorkspaceContext();

    expect(ctx).toContain("f0.txt");
    expect(ctx).not.toContain("- f59.txt");
    expect(ctx).toContain("(+20 more)");
  });

  it("omits the manifest block when WORKSPACE.md is missing", async () => {
    mockScope.summary = { convoId: "c1", attached: [] };
    vi.mocked(workspaceList).mockResolvedValue({ files: [{ path: "a.md" }], truncated: false });
    vi.mocked(workspaceRead).mockRejectedValue(new Error("not found"));

    const ctx = await collectWorkspaceContext();

    expect(ctx).toContain("- a.md");
    expect(ctx).not.toContain("workspace_manifest");
  });

  it("survives storage errors by returning an empty string", async () => {
    mockScope.summary = { convoId: "c1", attached: [] };
    vi.mocked(workspaceList).mockRejectedValue(new Error("storage gone"));

    await expect(collectWorkspaceContext()).resolves.toBe("");
  });
});

describe("collectProjectNames", () => {
  it("returns the shared project library names", async () => {
    await expect(collectProjectNames()).resolves.toEqual(["radar", "cleanup"]);
  });

  it("returns an empty list on failure", async () => {
    const { listProjectNames } = await import("../app/composables/workspaceSession");
    vi.mocked(listProjectNames).mockRejectedValue(new Error("boom"));
    await expect(collectProjectNames()).resolves.toEqual([]);
  });
});
