/**
 * @file mentions.js — parsing and resolution for @file references in chat
 * messages.
 *
 * A mention is `@` followed by a path-like token, NOT preceded by a
 * backslash. `\@` escapes a literal "@" and is unescaped on send.
 *
 * Resolution is deliberately conservative: a mention only "counts" when the
 * path exists in the workspace. Anything else stays plain text — the user
 * can always type @whatever without it turning into a file reference.
 */

/** Matches every unescaped @token anywhere in a message. */
const MENTION_GLOBAL = /(^|\s)@([\w][\w\-./]*)/g;

/** Caret-anchored trigger for the autocomplete popover. */
export const MENTION_TRIGGER_RE = /(?:^|(?<=\s))(?<!\\)@([\w\-./]*)$/;

/**
 * Builds the set of workspace paths that count as resolvable mentions.
 * @param {Array<{path: string}>} chatFiles
 * @param {Object<string, Array<{path: string}>>} projectFiles - name → files
 * @returns {Set<string>}
 */
export function buildKnownPaths(chatFiles = [], projectFiles = {}) {
  const set = new Set();
  for (const f of chatFiles || []) {
    if (f?.path) set.add(f.path);
  }
  for (const [name, files] of Object.entries(projectFiles || {})) {
    for (const f of files || []) {
      if (f?.path) set.add(`projects/${name}/${f.path}`);
    }
  }
  return set;
}

/**
 * Scans text for unescaped @tokens (valid or not).
 * @returns {Array<{path: string, index: number}>}
 */
export function scanMentionTokens(text) {
  const out = [];
  for (const m of String(text || "").matchAll(MENTION_GLOBAL)) {
    out.push({ path: m[2], index: m.index + m[1].length });
  }
  return out;
}

/**
 * Resolves mentions against the known workspace paths and unescapes
 * literal \@ sequences.
 *
 * @param {string} text
 * @param {Set<string>|Iterable<string>} knownPaths
 * @returns {{ cleanText: string, mentions: string[] }} cleanText has escape
 *   sequences removed; mentions is the deduped list of paths that exist.
 */
export function resolveMentions(text, knownPaths) {
  const known = knownPaths instanceof Set ? knownPaths : new Set(knownPaths || []);
  const mentions = [];
  for (const token of scanMentionTokens(text)) {
    if (known.has(token.path) && !mentions.includes(token.path)) {
      mentions.push(token.path);
    }
  }
  const cleanText = String(text || "").replace(/\\@/g, "@");
  return { cleanText, mentions };
}

/**
 * Filters + ranks workspace files for the autocomplete popover, with
 * search-filter semantics: case-insensitive substring match; matches at
 * the start of the path rank first, then earlier matches, then A→Z.
 *
 * @param {Array<{path: string}>} chatFiles
 * @param {Object<string, Array<{path: string}>>} projectFiles
 * @param {string} query - current @query ("" → show everything)
 * @param {number} [limit=8]
 * @returns {Array<{path: string}>}
 */
export function filterMentionFiles(chatFiles = [], projectFiles = {}, query = "", limit = 8) {
  const q = String(query || "").toLowerCase();
  const scored = [];
  const consider = (path) => {
    if (!path || scored.length >= limit * 8) return; // cap work on huge workspaces
    const lower = path.toLowerCase();
    if (q && !lower.includes(q)) return;
    scored.push({
      path,
      startsWith: q ? lower.startsWith(q) : true,
      at: q ? lower.indexOf(q) : 0,
    });
  };
  for (const f of chatFiles || []) consider(f?.path);
  for (const [name, files] of Object.entries(projectFiles || {})) {
    const prefix = `projects/${name}/`;
    for (const f of files || []) consider(f?.path ? prefix + f.path : undefined);
  }
  // Empty query = browse mode: keep natural order (chat files, then
  // projects). Ranking only applies to actual searches.
  if (q) {
    scored.sort((a, b) => {
      if (a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1;
      if (a.at !== b.at) return a.at - b.at;
      return a.path.localeCompare(b.path);
    });
  }
  return scored.slice(0, limit).map((s) => ({ path: s.path }));
}

/**
 * Locates resolvable mention spans in text — the single source of truth
 * for both highlight rendering and atomic token editing (backspace removes
 * a whole token, arrows jump over it, like Discord/Slack chips).
 *
 * @param {string} text
 * @param {Set<string>|Iterable<string>} knownPaths
 * @returns {Array<{start: number, end: number, path: string}>} end exclusive
 */
export function findMentionSpans(text, knownPaths) {
  const known = knownPaths instanceof Set ? knownPaths : new Set(knownPaths || []);
  const spans = [];
  for (const m of String(text || "").matchAll(MENTION_GLOBAL)) {
    const start = m.index + m[1].length;
    const path = m[2];
    // +1: the span covers the leading "@" too — chips render and delete as
    // one atomic "@path" unit.
    if (known.has(path)) spans.push({ start, end: start + path.length + 1, path });
  }
  return spans;
}

/**
 * Which span (if any) Backspace should remove atomically for a caret
 * position. ONLY when the caret touches the chip's right edge or sits
 * inside it. At the chip's LEFT edge (caret === start) this returns null:
 * Backspace must keep its normal meaning and delete the character BEHIND
 * the chip.
 */
export function backspaceTarget(spans, caret) {
  for (const sp of spans || []) {
    if (caret === sp.end || (caret > sp.start && caret < sp.end)) return sp;
  }
  return null;
}

/**
 * Which span (if any) the Delete key should remove atomically. Mirrors
 * backspaceTarget: touching the chip's LEFT edge or inside → the chip;
 * right edge + trailing space → the space goes first (null).
 */
export function deleteTarget(spans, caret) {
  for (const sp of spans || []) {
    if (caret === sp.start || (caret > sp.start && caret < sp.end)) return sp;
  }
  return null;
}

/** Per-file cap for attached contents, so one huge file can't flood context. */
export const MAX_ATTACHED_FILE_CHARS = 20000;

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Formats read file contents as attachment blocks appended to a message.
 * Files with `content === null/undefined` (read failures) are skipped —
 * their @path stays in the message text so the model can retry via tools.
 *
 * @param {Array<{path: string, content: string|null}>} entries
 * @returns {string} joined blocks ("" when nothing attached)
 */
export function formatAttachedFiles(entries) {
  const blocks = [];
  for (const entry of entries || []) {
    if (!entry?.path || typeof entry.content !== "string") continue;
    let content = entry.content;
    let truncated = "";
    if (content.length > MAX_ATTACHED_FILE_CHARS) {
      content = content.slice(0, MAX_ATTACHED_FILE_CHARS);
      truncated = "\n[…file truncated…]";
    }
    blocks.push(
      `<attached_file path="${escapeAttr(entry.path)}">\n${content}${truncated}\n</attached_file>`,
    );
  }
  return blocks.join("\n\n");
}
