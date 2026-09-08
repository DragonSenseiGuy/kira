/**
 * Tests for the workspace scoping layer (composables/workspaceSession.js).
 *
 * Verifies:
 *   - Path routing: bare paths → chat scope; projects/<name>/… → project
 *   - Attachment enforcement: unattached projects are refused with a
 *     helpful message
 *   - No active conversation (incognito) → file tools unavailable
 *
 * resolveScopePath accepts explicit convoId/attached options, so these run
 * without touching settings or real storage.
 */

import { describe, it, expect } from "vitest";
import {
  splitScopedPath,
  resolveScopePath,
  isFileToolsAvailable,
} from "../app/composables/workspaceSession.js";

describe("splitScopedPath", () => {
  it("routes bare paths to the chat scope", () => {
    expect(splitScopedPath("report.md")).toEqual({ scope: "chat", rel: "report.md" });
    expect(splitScopedPath("a/b/c.txt")).toEqual({ scope: "chat", rel: "a/b/c.txt" });
    expect(splitScopedPath("/leading/slash.txt")).toEqual({
      scope: "chat",
      rel: "leading/slash.txt",
    });
  });

  it("routes projects/<name>/… to the project scope", () => {
    const r = splitScopedPath("projects/budget/data/2026.csv");
    expect(r).toEqual({ scope: "project", name: "budget", rel: "data/2026.csv" });
    // Bare project folder without a file is still routed (validation happens later)
    const folder = splitScopedPath("projects/site");
    expect(folder.scope).toBe("project");
    expect(folder.rel).toBe("");
  });

  it("does not treat 'project' or nested lookalikes as scopes", () => {
    expect(splitScopedPath("project/x")?.scope ?? "chat").toBe("chat");
    expect(splitScopedPath("my-projects/x").scope).toBe("chat");
  });
});

describe("resolveScopePath", () => {
  it("throws a clear refusal when no conversation is active (incognito)", async () => {
    await expect(resolveScopePath("x.txt", { convoId: null })).rejects.toThrow(
      /incognito/i,
    );
    expect(isFileToolsAvailable()).toBe(false);
  });

  it("resolves chat-scope paths against the conversation root", async () => {
    const resolved = await resolveScopePath("notes/todo.md", {
      convoId: "abc123",
      attached: [],
    });
    expect(resolved.scope).toBe("chat");
    expect(resolved.rel).toBe("notes/todo.md");
    expect(resolved.root).toBeTruthy(); // handle-like object created lazily
  });

  it("allows access only to ATTACHED projects", async () => {
    const ok = await resolveScopePath("projects/budget/data.csv", {
      convoId: "abc123",
      attached: ["budget", "website"],
    });
    expect(ok.scope).toBe("project");
    expect(ok.projectName).toBe("budget");

    await expect(
      resolveScopePath("projects/secret/key.pem", {
        convoId: "abc123",
        attached: ["budget"],
      }),
    ).rejects.toThrow(/not attached/);
  });

  it("rejects a bare project path with no file component", async () => {
    await expect(
      resolveScopePath("projects/budget/", { convoId: "abc123", attached: ["budget"] }),
    ).rejects.toThrow(/file name is required/i);
  });
});

describe("scoping adversarial paths", () => {
  it("never grants access via .. inside the project segment", async () => {
    // "projects/.." tries to climb out of the projects directory; the split
    // treats ".." as a project NAME, which can never be attached.
    const split = splitScopedPath("projects/../chats/victim/secret.txt");
    expect(split.scope).toBe("project");
    expect(split.name).toBe("..");

    await expect(
      resolveScopePath("projects/../chats/victim/secret.txt", {
        convoId: "abc123",
        attached: ["budget"],
      }),
    ).rejects.toThrow(/not attached/);
  });

  it("normalizes leading slashes for project paths too", () => {
    const r = splitScopedPath("/projects/budget/a.txt");
    expect(r).toEqual({ scope: "project", name: "budget", rel: "a.txt" });
  });

  it("collapses empty segments so projects//file resolves sanely", async () => {
    // "projects//file" → name "file", rel "" → refused (needs a file name).
    await expect(
      resolveScopePath("projects//file", { convoId: "abc123", attached: ["file"] }),
    ).rejects.toThrow(/file name is required/i);
  });

  it("keeps inner .. in the relative path for the storage layer to reject", async () => {
    // This layer deliberately does NOT sanitize rel — workspaceWrite owns
    // traversal validation. The split must preserve it verbatim so that
    // downstream checks still see the attack.
    const r = splitScopedPath("projects/budget/a/../../escape.txt");
    expect(r.scope).toBe("project");
    expect(r.name).toBe("budget");
    expect(r.rel).toBe("a/../../escape.txt");
  });

  it("routes lookalike spellings to the chat scope", () => {
    expect(splitScopedPath("Projects/budget/x").scope).toBe("chat"); // case-sensitive
    expect(splitScopedPath("projects.extra/x").scope).toBe("chat");
    expect(splitScopedPath("my projects/x").scope).toBe("chat");
  });

  it("handles unicode and space project names", async () => {
    const ok = await resolveScopePath("projects/Projekt Straßenbahn/data.txt", {
      convoId: "abc123",
      attached: ["Projekt Straßenbahn"],
    });
    expect(ok.projectName).toBe("Projekt Straßenbahn");
    expect(ok.rel).toBe("data.txt");
  });
});
