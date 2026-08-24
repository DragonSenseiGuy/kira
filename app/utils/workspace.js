/**
 * @file workspace.js
 * @description Persistent agent workspace backed by the Origin Private File
 * System (OPFS), with an in-memory fallback for browsers/contexts without
 * OPFS. The model accesses it through the write_file / read_file / list_files
 * tools, and from inside the JavaScript sandbox via a small RPC bridge.
 *
 * Design notes:
 * - All paths are workspace-relative and strictly sanitized (no absolute
 *   paths, no `..` traversal, no control characters). The workspace root is
 *   the OPFS root for this origin, so isolation is enforced by the browser.
 * - Every op accepts an optional injected `root` handle so tests can run
 *   against mock directory handles without touching real storage.
 * - Handles only need to implement: getDirectoryHandle(name, {create}),
 *   getFileHandle(name, {create}), removeEntry(name, {recursive}) and
 *   entries() yielding [name, handle] pairs — the subset real OPFS provides.
 */

/** Maximum number of entries returned by a single listing. */
export const WORKSPACE_MAX_ENTRIES = 500;

/** Maximum nesting depth accepted by the path sanitizer. */
export const WORKSPACE_MAX_DEPTH = 16;

/** Per-file write cap. Prevents runaway quota blowups. */
export const WORKSPACE_MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Normalizes and validates a workspace-relative path.
 *
 * @param {*} input - Raw path (usually from model tool args).
 * @returns {{ok: true, path: string} | {ok: false, error: string}}
 */
export function sanitizeWorkspacePath(input) {
  if (typeof input !== "string") {
    return { ok: false, error: "Path must be a string." };
  }

  const normalized = input.replace(/\\/g, "/").trim();
  const segments = [];
  for (const raw of normalized.split("/")) {
    const seg = raw.trim();
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      return {
        ok: false,
        error: "Path traversal ('..') is not allowed in the workspace.",
      };
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(seg)) {
      return { ok: false, error: "Path contains control characters." };
    }
    if (seg.length > 128) {
      return { ok: false, error: "Path segment is too long (max 128 chars)." };
    }
    segments.push(seg);
  }

  if (segments.length > WORKSPACE_MAX_DEPTH) {
    return { ok: false, error: `Path is too deep (max ${WORKSPACE_MAX_DEPTH} levels).` };
  }

  const path = segments.join("/");
  if (path.length > 512) {
    return { ok: false, error: "Path is too long (max 512 chars)." };
  }
  return { ok: true, path };
}

// ---------------------------------------------------------------------------
// In-memory fallback (used when OPFS is unavailable)
// ---------------------------------------------------------------------------

function createMemoryRoot() {
  const node = { kind: "directory", children: new Map() };
  return node;
}

function memResolveDir(root, segments, create) {
  let dir = root;
  for (const seg of segments) {
    let next = dir.children.get(seg);
    if (!next) {
      if (!create) return null;
      next = { kind: "directory", children: new Map() };
      dir.children.set(seg, next);
    }
    if (next.kind !== "directory") return null; // a file blocks the way
    dir = next;
  }
  return dir;
}

function memParentOf(root, segments, create) {
  if (segments.length === 0) return null;
  return memResolveDir(root, segments.slice(0, -1), create);
}

// ---------------------------------------------------------------------------
// Default root resolution
// ---------------------------------------------------------------------------

let defaultRootPromise = null;

/**
 * Resolves the default workspace root: the origin's OPFS directory when
 * available, otherwise a process-lifetime in-memory tree.
 *
 * @returns {Promise<object>} A directory-handle-like root.
 */
export function getDefaultRoot() {
  if (!defaultRootPromise) {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.storage &&
        typeof navigator.storage.getDirectory === "function"
      ) {
        defaultRootPromise = navigator.storage.getDirectory();
      } else {
        defaultRootPromise = Promise.resolve(createMemoryRoot());
      }
    } catch {
      defaultRootPromise = Promise.resolve(createMemoryRoot());
    }
  }
  return defaultRootPromise;
}

function isMemoryNode(handle) {
  return !!handle && typeof handle === "object" && handle.kind === "directory" && handle.children instanceof Map;
}

async function resolveDefaultRoot(root) {
  return root !== undefined ? root : await getDefaultRoot();
}

/**
 * Walks (creating when asked) every directory segment except the last,
 * then returns { parentDir, name } for the final segment.
 */
async function splitIntoParentAndName(rootHandle, segments, create) {
  if (segments.length === 0) {
    throw new Error("A file name is required.");
  }
  let dir = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    const name = segments[i];
    dir = isMemoryNode(dir)
      ? (() => {
          const d = memResolveDir(dir, [name], create);
          if (!d) throw new Error(`"${name}" is not a directory.`);
          return d;
        })()
      : await dir.getDirectoryHandle(name, { create });
  }
  return { parentDir: dir, name: segments[segments.length - 1] };
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/**
 * Writes a UTF-8 text file, creating parent directories as needed.
 *
 * @param {string} rawPath - Workspace-relative path ("src/main.js").
 * @param {string} content - Text content to write (replaces existing).
 * @param {object} [root] - Injected root handle (tests / advanced use).
 * @returns {Promise<{path: string, bytes: number}>}
 */
export async function workspaceWrite(rawPath, content, root) {
  const sanitized = sanitizeWorkspacePath(rawPath);
  if (!sanitized.ok) throw new Error(sanitized.error);
  if (sanitized.path === "") {
    throw new Error("A file name is required.");
  }
  if (typeof content !== "string") {
    throw new Error("Content must be a string of text.");
  }

  const rootHandle = await resolveDefaultRoot(root);
  const segments = sanitized.path.split("/");
  const { parentDir, name } = await splitIntoParentAndName(rootHandle, segments, true);

  const bytes = new TextEncoder().encode(content).length;
  if (bytes > WORKSPACE_MAX_FILE_BYTES) {
    throw new Error(
      `File is too large (${formatBytes(bytes)}); the limit is ${formatBytes(WORKSPACE_MAX_FILE_BYTES)}.`,
    );
  }

  if (isMemoryNode(parentDir)) {
    parentDir.children.set(name, { kind: "file", content });
    return { path: sanitized.path, bytes };
  }

  const fileHandle = await parentDir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return { path: sanitized.path, bytes };
}

/**
 * Reads a UTF-8 text file.
 *
 * @param {string} rawPath - Workspace-relative path.
 * @param {object} [root] - Injected root handle (tests / advanced use).
 * @returns {Promise<{path: string, content: string}>}
 */
export async function workspaceRead(rawPath, root) {
  const sanitized = sanitizeWorkspacePath(rawPath);
  if (!sanitized.ok) throw new Error(sanitized.error);
  if (sanitized.path === "") {
    throw new Error("A file name is required.");
  }

  const rootHandle = await resolveDefaultRoot(root);
  const segments = sanitized.path.split("/");
  const { parentDir, name } = await splitIntoParentAndName(rootHandle, segments, false);

  if (isMemoryNode(parentDir)) {
    const node = parentDir.children.get(name);
    if (!node || node.kind !== "file") {
      throw new Error(`File not found: "${sanitized.path}".`);
    }
    return { path: sanitized.path, content: node.content };
  }

  let fileHandle;
  try {
    fileHandle = await parentDir.getFileHandle(name, { create: false });
  } catch (err) {
    if (err && (err.name === "NotFoundError" || err.name === "TypeMismatchError")) {
      throw new Error(`File not found: "${sanitized.path}".`);
    }
    throw err;
  }
  try {
    const file = await fileHandle.getFile();
    return { path: sanitized.path, content: await file.text() };
  } catch (err) {
    throw new Error(`Could not read "${sanitized.path}": ${err.message || err}`);
  }
}

/**
 * Lists files recursively under a workspace directory (default: root).
 *
 * @param {string} [rawPath] - Directory path; empty string means root.
 * @param {object} [root] - Injected root handle (tests / advanced use).
 * @returns {Promise<{path: string, files: Array<{path: string, size: number}>, truncated: boolean}>}
 */
export async function workspaceList(rawPath = "", root) {
  const sanitized = sanitizeWorkspacePath(rawPath ?? "");
  if (!sanitized.ok) throw new Error(sanitized.error);

  const rootHandle = await resolveDefaultRoot(root);
  const baseSegments = sanitized.path === "" ? [] : sanitized.path.split("/");

  let startDir = rootHandle;
  if (baseSegments.length > 0) {
    startDir = isMemoryNode(rootHandle)
      ? memResolveDir(rootHandle, baseSegments, false)
      : await walkExistingDirs(rootHandle, baseSegments);
    if (!startDir) {
      throw new Error(`Directory not found: "${sanitized.path}".`);
    }
  }

  const files = [];
  let truncated = false;

  async function walk(dirHandle, prefix) {
    if (truncated) return;
    if (isMemoryNode(dirHandle)) {
      for (const [name, node] of dirHandle.children) {
        if (files.length >= WORKSPACE_MAX_ENTRIES) {
          truncated = true;
          return;
        }
        const childPath = prefix ? `${prefix}/${name}` : name;
        if (node.kind === "file") {
          files.push({ path: childPath, size: node.content.length });
        } else {
          await walk(node, childPath);
        }
      }
      return;
    }
    for await (const [name, handle] of dirHandle.entries()) {
      if (files.length >= WORKSPACE_MAX_ENTRIES) {
        truncated = true;
        return;
      }
      const childPath = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "file") {
        let size = 0;
        try {
          size = (await handle.getFile()).size;
        } catch {
          size = 0;
        }
        files.push({ path: childPath, size });
      } else if (handle.kind === "directory") {
        await walk(handle, childPath);
      }
    }
  }

  await walk(startDir, "");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { path: sanitized.path, files, truncated };
}

async function walkExistingDirs(rootHandle, segments) {
  let dir = rootHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(segments[i], { create: false });
    } catch {
      return null;
    }
  }
  try {
    return await dir.getDirectoryHandle(segments[segments.length - 1], { create: false });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deletion / moving / searching / editing
// ---------------------------------------------------------------------------

/**
 * Deletes a file or directory (directories recursively) from a workspace.
 *
 * @param {string} rawPath
 * @param {object} [root] - Injected root handle.
 * @returns {Promise<{path: string, kind: 'file'|'directory'}>}
 */
export async function workspaceDelete(rawPath, root) {
  const sanitized = sanitizeWorkspacePath(rawPath);
  if (!sanitized.ok) throw new Error(sanitized.error);
  if (sanitized.path === "") throw new Error("Cannot delete the workspace root.");

  const rootHandle = await resolveDefaultRoot(root);
  const segments = sanitized.path.split("/");
  const { parentDir, name } = await splitIntoParentAndName(rootHandle, segments, false);

  if (isMemoryNode(parentDir)) {
    const node = parentDir.children.get(name);
    if (!node) throw new Error(`Not found: "${sanitized.path}".`);
    parentDir.children.delete(name);
    return { path: sanitized.path, kind: node.kind === "file" ? "file" : "directory" };
  }

  // Probe to report an accurate kind (and a friendly missing-file error).
  let kind = "file";
  try {
    await parentDir.getFileHandle(name, { create: false });
  } catch {
    try {
      await parentDir.getDirectoryHandle(name, { create: false });
      kind = "directory";
    } catch {
      throw new Error(`File not found: "${sanitized.path}".`);
    }
  }
  try {
    await parentDir.removeEntry(name, { recursive: true });
  } catch (err) {
    throw new Error(`Could not delete "${sanitized.path}": ${err.message || err}`);
  }
  return { path: sanitized.path, kind };
}

function globToRegExp(pattern) {
  const escaped = String(pattern)
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Searches workspace file NAMES by glob pattern ("*.csv", "report*").
 * Falls back to case-insensitive substring matching when the pattern has no
 * wildcard characters.
 *
 * @param {string} pattern
 * @param {string} [rawPath] - Directory to search; defaults to whole root.
 * @param {object} [root] - Injected root handle.
 */
export async function workspaceSearch(pattern, rawPath = "", root) {
  if (typeof pattern !== "string" || !pattern.trim()) {
    throw new Error('search_files requires a "pattern".');
  }
  const re = globToRegExp(pattern);
  const listing = await workspaceList(rawPath ?? "", root);
  const substring = !pattern.includes("*") && !pattern.includes("?");
  const needle = pattern.toLowerCase();
  const files = listing.files.filter((f) =>
    substring ? f.path.toLowerCase().includes(needle) : re.test(f.path.split("/").pop()),
  );
  return { path: listing.path, files, truncated: false };
}

async function copyTree(srcDir, dstDir) {
  for await (const [name, handle] of srcDir.entries()) {
    if (handle.kind === "file") {
      const text = await (await handle.getFile()).text();
      const fh = await dstDir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    } else {
      await copyTree(handle, await dstDir.getDirectoryHandle(name, { create: true }));
    }
  }
}

async function memCopyTree(srcNode, dstNode) {
  for (const [name, node] of srcNode.children) {
    if (node.kind === "file") {
      dstNode.children.set(name, { kind: "file", content: node.content });
    } else {
      const next = { kind: "directory", children: new Map() };
      dstNode.children.set(name, next);
      await memCopyTree(node, next);
    }
  }
}

/**
 * Moves (or renames) a file or directory within a scope. Implemented as
 * copy + delete since OPFS has no native move. The destination must not
 * already exist unless it is inside the same directory tree being moved.
 *
 * @param {string} fromPath
 * @param {string} toPath
 * @param {object} [root]
 * @returns {Promise<{from: string, to: string}>}
 */
export async function workspaceMove(fromPath, toPath, root) {
  const fromSan = sanitizeWorkspacePath(fromPath);
  if (!fromSan.ok) throw new Error(fromSan.error);
  const toSan = sanitizeWorkspacePath(toPath);
  if (!toSan.ok) throw new Error(toSan.error);
  if (!fromSan.path || !toSan.path) throw new Error("Both source and destination paths are required.");
  if (fromSan.path === toSan.path) throw new Error("Source and destination are identical.");

  const rootHandle = await resolveDefaultRoot(root);

  const readText = async (p) => (await workspaceRead(p, rootHandle)).content;

  // Detect what the source is.
  const fromListing = await workspaceList(fromSan.path, rootHandle).catch(() => null);
  const isDirMove = !!fromListing;

  if (!isDirMove) {
    const content = await readText(fromSan.path); // throws friendly NotFound
    await workspaceWrite(toSan.path, content, rootHandle);
    await workspaceDelete(fromSan.path, rootHandle);
    return { from: fromSan.path, to: toSan.path };
  }

  // Directory move: refuse nesting a directory into itself.
  if (toSan.path.startsWith(`${fromSan.path}/`)) {
    throw new Error("Cannot move a directory into itself.");
  }

  if (isMemoryNode(rootHandle)) {
    const fromParent = memParentOf(rootHandle, fromSan.path.split("/"), false);
    const srcName = fromSan.path.split("/").pop();
    const srcNode = fromParent?.children.get(srcName);
    if (!srcNode) throw new Error(`Directory not found: "${fromSan.path}".`);
    const dstSegments = toSan.path.split("/");
    const dstParent = memResolveDir(rootHandle, dstSegments.slice(0, -1), true);
    const clone = { kind: "directory", children: new Map() };
    await memCopyTree(srcNode, clone);
    dstParent.children.set(dstSegments[dstSegments.length - 1], clone);
    fromParent.children.delete(srcName);
    return { from: fromSan.path, to: toSan.path };
  }

  const fromSegments = fromSan.path.split("/");
  const fromParentHandle = await walkToDir(rootHandle, fromSegments.slice(0, -1));
  const srcDir = await walkToDir(rootHandle, fromSegments);
  const dstDir = await ensureDirs(rootHandle, toSan.path.split("/").slice(0, -1));
  await copyTree(srcDir, dstDir);
  await fromParentHandle.removeEntry(fromSegments[fromSegments.length - 1], { recursive: true });
  return { from: fromSan.path, to: toSan.path };
}

/**
 * Returns a named subdirectory of `root`, creating it when allowed.
 * Works with BOTH real OPFS directory handles and the in-memory fallback
 * nodes, so higher layers (session scoping, panel) never need to care.
 */
export async function getSubdirectory(root, name, { create = true } = {}) {
  if (isMemoryNode(root)) {
    const node = memResolveDir(root, [name], create);
    if (!node) throw new Error(`"${name}" is not a directory.`);
    return node;
  }
  return root.getDirectoryHandle(name, { create });
}

/**
 * Removes a named child (file or directory tree) from `root`.
 * Dual-mode counterpart of getSubdirectory.
 */
export async function removeChildEntry(root, name) {
  if (isMemoryNode(root)) {
    if (!root.children.has(name)) return false;
    root.children.delete(name);
    return true;
  }
  await root.removeEntry(name, { recursive: true });
  return true;
}

async function walkToDir(rootHandle, segments) {
  let dir = rootHandle;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: false });
  }
  return dir;
}

async function ensureDirs(rootHandle, segments) {
  let dir = rootHandle;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

/**
 * Appends text to a file, creating it when it does not exist yet.
 * Lets models build large files in token-budget-sized chunks.
 */
export async function workspaceAppend(rawPath, content, root) {
  if (typeof content !== "string") throw new Error("Content must be a string of text.");
  let existing = "";
  let existed = true;
  try {
    existing = (await workspaceRead(rawPath, root)).content;
  } catch {
    existed = false;
    const sanitized = sanitizeWorkspacePath(rawPath);
    if (!sanitized.ok) throw new Error(sanitized.error);
  }
  void existed;
  return workspaceWrite(rawPath, existing + content, root);
}

/**
 * Replaces the first occurrence of `oldText` in `content` with `newText`.
 * Pure helper used by the edit_file tool.
 *
 * @returns {{ok: boolean, content?: string, occurrences?: number, error?: string}}
 */
export function computeEdit(content, oldText, newText) {
  if (typeof content !== "string") return { ok: false, error: "File could not be read." };
  if (typeof oldText !== "string" || oldText === "") {
    return { ok: false, error: '"old_text" must be a non-empty string.' };
  }
  if (typeof newText !== "string") newText = "";
  const first = content.indexOf(oldText);
  if (first === -1) return { ok: false, error: "old_text was not found in the file." };
  return {
    ok: true,
    occurrences: 1,
    content: content.slice(0, first) + newText + content.slice(first + oldText.length),
  };
}

// ---------------------------------------------------------------------------
// Manifest seeding
// ---------------------------------------------------------------------------

/** Default WORKSPACE.md contents for a fresh scope. */
export function buildWorkspaceManifest(title = "This chat's workspace") {
  return [
    `# ${title}`,
    "",
    "Working notes, data, and documents live here. This manifest helps you",
    "(the assistant) orient yourself across sessions — keep it current.",
    "",
    "## Conventions",
    "",
    "- Loose files at the root are scratch space.",
    "- Organized work belongs in a named folder: reports/, data/, notes/, etc.",
    "- Update this file when you start, finish, or abandon something.",
    "",
    "## Contents",
    "",
    "_Nothing yet._",
    "",
  ].join("\n");
}

/**
 * Seeds a scope with WORKSPACE.md if it does not exist yet.
 * @returns {Promise<boolean>} true when a seed was written.
 */
export async function ensureWorkspaceSeeded(root, title) {
  try {
    await workspaceRead("WORKSPACE.md", root);
    return false;
  } catch {
    await workspaceWrite("WORKSPACE.md", buildWorkspaceManifest(title), root);
    return true;
  }
}

/** Formats byte counts for human display. */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
