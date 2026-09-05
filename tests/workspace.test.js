/**
 * Tests for app/utils/workspace.js — the persistent agent workspace.
 *
 * Covers:
 *   - Path sanitization (traversal, absolute paths, control chars, depth)
 *   - The in-memory fallback filesystem (default root in test env)
 *   - OPFS-shaped mock handles (nested writes, reads, recursive listing,
 *     truncation, NotFound errors)
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeWorkspacePath,
  getDefaultRoot,
  workspaceWrite,
  workspaceRead,
  workspaceList,
  workspaceDelete,
  workspaceMove,
  workspaceSearch,
  computeEdit,
  WORKSPACE_MAX_ENTRIES,
  WORKSPACE_MAX_FILE_BYTES,
} from "../app/utils/workspace.js";

describe("sanitizeWorkspacePath", () => {
  it("normalizes slashes and drops empty/dot segments", () => {
    expect(sanitizeWorkspacePath("/foo//bar/")).toEqual({ ok: true, path: "foo/bar" });
    expect(sanitizeWorkspacePath("./a/./b")).toEqual({ ok: true, path: "a/b" });
    expect(sanitizeWorkspacePath("a\\b\\c.txt")).toEqual({ ok: true, path: "a/b/c.txt" });
    expect(sanitizeWorkspacePath("")).toEqual({ ok: true, path: "" });
  });

  it("rejects traversal", () => {
    const r = sanitizeWorkspacePath("../etc/passwd");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/traversal/i);

    expect(sanitizeWorkspacePath("a/b/../../c").ok).toBe(false);
  });

  it("rejects non-strings, control characters, and oversized paths", () => {
    expect(sanitizeWorkspacePath(null).ok).toBe(false);
    expect(sanitizeWorkspacePath(42).ok).toBe(false);
    expect(sanitizeWorkspacePath("bad\u0000name").ok).toBe(false);
    expect(sanitizeWorkspacePath("x".repeat(600)).ok).toBe(false);
    expect(sanitizeWorkspacePath(`${"y".repeat(130)}/file`).ok).toBe(false);
  });

  it("rejects excessive depth", () => {
    const deep = Array.from({ length: 20 }, (_, i) => `d${i}`).join("/");
    expect(sanitizeWorkspacePath(deep).ok).toBe(false);
  });
});

describe("workspace ops on the default root (in-memory fallback)", () => {
  it("writes, reads, and lists files with nested directories", async () => {
    const root = await getDefaultRoot();
    // In the happy-dom test environment there is no OPFS, so the default
    // root is the in-memory tree. Assert that assumption holds so this
    // suite keeps testing what it thinks it tests.
    expect(root.kind).toBe("directory");
    expect(root.children).toBeInstanceOf(Map);

    const w = await workspaceWrite("mem-test/src/app.js", "console.log(1)");
    expect(w).toEqual({ path: "mem-test/src/app.js", bytes: 14 });

    const r = await workspaceRead("mem-test/src/app.js");
    expect(r.content).toBe("console.log(1)");

    const listing = await workspaceList("mem-test");
    expect(listing.truncated).toBe(false);
    expect(listing.files.map((f) => f.path)).toEqual(["src/app.js"]);

    const all = await workspaceList();
    expect(all.files.some((f) => f.path === "mem-test/src/app.js")).toBe(true);
  });

  it("round-trips unicode content and reports accurate byte size", async () => {
    const content = "héllo 🌍";
    const { bytes } = await workspaceWrite("mem-unicode.txt", content);
    expect(bytes).toBe(new TextEncoder().encode(content).length);
    expect((await workspaceRead("mem-unicode.txt")).content).toBe(content);
  });

  it("errors on missing files and empty file names", async () => {
    await expect(workspaceRead("definitely-missing.txt")).rejects.toThrow(/not found/i);
    await expect(workspaceRead("")).rejects.toThrow(/file name is required/i);
    await expect(workspaceWrite("", "x")).rejects.toThrow(/file name is required/i);
  });

  it("enforces sanitization through the public API", async () => {
    await expect(workspaceWrite("../escape.txt", "x")).rejects.toThrow(/traversal/i);
    await expect(workspaceRead(123)).rejects.toThrow(/string/i);
  });
});

// Minimal OPFS-shaped handles exercising the real handle-based code paths.
class MockFile {
  constructor(name) {
    this.kind = "file";
    this.name = name;
    this.content = "";
  }
  async getFile() {
    return { size: this.content.length, text: async () => this.content };
  }
  async createWritable() {
    const self = this;
    return {
      async write(data) {
        self.content = data;
      },
      async close() {},
    };
  }
}

class MockDir {
  constructor(name) {
    this.kind = "directory";
    this.name = name;
    this.children = new Map();
  }
  child(name) {
    return this.children.get(name);
  }
  async getDirectoryHandle(name, { create }) {
    let h = this.children.get(name);
    if (!h || h.kind !== "directory") {
      if (!create) {
        throw Object.assign(new Error("not found"), { name: "NotFoundError" });
      }
      if (h && h.kind !== "directory") {
        throw Object.assign(new Error("type mismatch"), { name: "TypeMismatchError" });
      }
      h = new MockDir(name);
      this.children.set(name, h);
    }
    return h;
  }
  async getFileHandle(name, { create }) {
    let h = this.children.get(name);
    if (!h || h.kind !== "file") {
      if (!create) {
        throw Object.assign(new Error("not found"), { name: "NotFoundError" });
      }
      if (h && h.kind !== "file") {
        throw Object.assign(new Error("type mismatch"), { name: "TypeMismatchError" });
      }
      h = new MockFile(name);
      this.children.set(name, h);
    }
    return h;
  }
  async *entries() {
    for (const [k, v] of this.children) yield [k, v];
  }
}

describe("workspace ops against OPFS-shaped handles", () => {
  it("creates parent directories and round-trips content", async () => {
    const root = new MockDir("root");
    await workspaceWrite("projects/web/index.html", "<h1>hi</h1>", root);
    const res = await workspaceRead("projects/web/index.html", root);
    expect(res.content).toBe("<h1>hi</h1>");

    const listing = await workspaceList("projects", root);
    expect(listing.files).toEqual([
      { path: "web/index.html", size: 11 },
    ]);
  });

  it("recursive listing sorts by path and reports sizes", async () => {
    const root = new MockDir("root");
    await workspaceWrite("b.txt", "12345", root);
    await workspaceWrite("a/c.txt", "12", root);
    await workspaceWrite("a/deep/d.txt", "1", root);

    const listing = await workspaceList("", root);
    expect(listing.files.map((f) => f.path)).toEqual([
      "a/c.txt",
      "a/deep/d.txt",
      "b.txt",
    ]);
    expect(listing.files.map((f) => f.size)).toEqual([2, 1, 5]);
  });

  it("throws a friendly error for missing files", async () => {
    const root = new MockDir("root");
    await expect(workspaceRead("nope.txt", root)).rejects.toThrow(
      /File not found/,
    );
    await expect(workspaceList("missing-dir", root)).rejects.toThrow(
      /Directory not found/,
    );
  });

  it("stops listing at the entry cap and flags truncation", async () => {
    const root = new MockDir("root");
    for (let i = 0; i < WORKSPACE_MAX_ENTRIES + 10; i++) {
      root.children.set(`f${String(i).padStart(4, "0")}.txt`, new MockFile(`f${i}`));
    }
    const listing = await workspaceList("", root);
    expect(listing.files.length).toBe(WORKSPACE_MAX_ENTRIES);
    expect(listing.truncated).toBe(true);
  });

  it("rejects invalid paths injected through the tools layer", async () => {
    const root = new MockDir("root");
    await expect(workspaceWrite("..\\win\\escape", "x", root)).rejects.toThrow(
      /traversal/i,
    );
  });
});

describe("workspace mutations (delete / move / search) on memory fallback", () => {
  it("deletes files and refuses missing ones", async () => {
    await workspaceWrite("del/a.txt", "bye", undefined);
    const out = await workspaceDelete("del/a.txt");
    expect(out).toEqual({ path: "del/a.txt", kind: "file" });
    await expect(workspaceRead("del/a.txt")).rejects.toThrow(/not found/i);
    await expect(workspaceDelete("del/ghost.txt")).rejects.toThrow(/not found/i);
    await expect(workspaceDelete("")).rejects.toThrow(/root/i);
  });

  it("moves and renames within a scope", async () => {
    await workspaceWrite("mv/old-name.md", "# hi", undefined);
    const out = await workspaceMove("mv/old-name.md", "mv/new-name.md");
    expect(out).toEqual({ from: "mv/old-name.md", to: "mv/new-name.md" });
    await expect(workspaceRead("mv/old-name.md")).rejects.toThrow(/not found/i);
    expect((await workspaceRead("mv/new-name.md")).content).toBe("# hi");

    // Renaming into an existing file overwrites destination, removes source.
    await workspaceWrite("mv/collision.md", "older", undefined);
    await workspaceMove("mv/new-name.md", "mv/collision.md");
    expect((await workspaceRead("mv/collision.md")).content).toBe("# hi");
  });

  it("refuses moving a directory into itself or identical paths", async () => {
    await workspaceWrite("proj/src/app.js", "1;", undefined);
    await expect(workspaceMove("proj", "proj/src")).rejects.toMatchObject({});
    await expect(workspaceMove("proj/src/app.js", "proj/src/app.js")).rejects.toThrow(
      /identical/i,
    );
  });

  it("searches by glob and substring", async () => {
    await workspaceWrite("srch/report-2026.csv", "a,b", undefined);
    await workspaceWrite("srch/data.json", "{}", undefined);
    await workspaceWrite("srch/deep/notes.csv", "x", undefined);

    const csv = await workspaceSearch("*.csv", "srch");
    expect(csv.files.map((f) => f.path).sort()).toEqual([
      "deep/notes.csv",
      "report-2026.csv",
    ]);

    const sub = await workspaceSearch("data", "srch");
    expect(sub.files.map((f) => f.path)).toEqual(["data.json"]);

    await expect(workspaceSearch("", "srch")).rejects.toThrow(/pattern/i);
  });

  it("enforces the per-file size cap on write", async () => {
    await expect(
      workspaceWrite("big/blob.txt", "y".repeat(WORKSPACE_MAX_FILE_BYTES + 1)),
    ).rejects.toThrow(/too large/i);
  });

  it("computeEdit replaces exactly one occurrence and validates input", () => {
    expect(computeEdit("hello world", "world", "there")).toEqual({
      ok: true,
      occurrences: 1,
      content: "hello there",
    });
    expect(computeEdit("abc", "zzz", "q").ok).toBe(false);
    expect(computeEdit("abc", "", "q").error).toMatch(/non-empty/i);
    // Empty new_text deletes the snippet.
    expect(computeEdit("a[X]b", "[X]", "").content).toBe("ab");
  });
});
