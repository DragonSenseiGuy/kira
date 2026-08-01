/**
 * @file promptLibrary.js
 * @description Saved prompt templates, inserted from the composer with `/`.
 *
 * A prompt is `{ id, name, body, description }`. Bodies may contain
 * `{{placeholder}}` slots; inserting a prompt drops the body into the composer
 * and reports where the first slot is so the caller can select it for typing
 * over.
 *
 * Pure functions only — persistence lives in `usePromptLibrary.js`.
 */

/** Matches `{{ placeholder }}`, capturing the trimmed name. */
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Characters allowed in a slash trigger after the `/`. */
const TRIGGER_PATTERN = /^[\w-]*$/;

/**
 * Generates an id for a new prompt.
 * @returns {string}
 */
export function createPromptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalises a stored or user-supplied prompt into the canonical shape,
 * dropping anything unusable.
 *
 * @param {Object} prompt - The raw prompt.
 * @returns {Object|null} A normalised prompt, or null if it has no body.
 */
export function normalizePrompt(prompt) {
  if (!prompt || typeof prompt !== "object") return null;

  const body = typeof prompt.body === "string" ? prompt.body : "";
  if (!body.trim()) return null;

  const name = typeof prompt.name === "string" && prompt.name.trim()
    ? prompt.name.trim()
    : "Untitled prompt";

  return {
    id: typeof prompt.id === "string" && prompt.id ? prompt.id : createPromptId(),
    name,
    description:
      typeof prompt.description === "string" ? prompt.description.trim() : "",
    body,
  };
}

/**
 * Normalises a whole library, dropping invalid entries and duplicate ids.
 *
 * @param {*} prompts - Raw stored value.
 * @returns {Array<Object>} A clean prompt list.
 */
export function normalizeLibrary(prompts) {
  if (!Array.isArray(prompts)) return [];

  const seen = new Set();
  const clean = [];

  for (const raw of prompts) {
    const prompt = normalizePrompt(raw);
    if (!prompt || seen.has(prompt.id)) continue;
    seen.add(prompt.id);
    clean.push(prompt);
  }

  return clean;
}

/**
 * Lists the distinct placeholder names in a prompt body, in first-seen order.
 *
 * @param {string} body - The prompt body.
 * @returns {string[]} Placeholder names (empty names are ignored).
 */
export function extractPlaceholders(body) {
  if (typeof body !== "string") return [];

  const names = [];
  const seen = new Set();

  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

/**
 * Substitutes placeholder values into a body. Unfilled placeholders are left
 * in place so the user can still see what is missing.
 *
 * @param {string} body - The prompt body.
 * @param {Record<string, string>} [values] - Values keyed by placeholder name.
 * @returns {string} The filled body.
 */
export function applyPlaceholders(body, values = {}) {
  if (typeof body !== "string") return "";

  return body.replace(PLACEHOLDER_PATTERN, (match, name) => {
    const value = values[name];
    return value === undefined || value === null || value === "" ? match : String(value);
  });
}

/**
 * Detects an in-progress `/slash` trigger at the caret.
 *
 * The trigger only counts at the very start of the text or at the start of a
 * line, so a URL like `https://x/y` never opens the menu.
 *
 * @param {string} text - The full composer text.
 * @param {number} caret - The caret offset.
 * @returns {{active: boolean, query: string, start: number}} `start` is the
 *   index of the `/` when active.
 */
export function detectSlashTrigger(text, caret) {
  const inactive = { active: false, query: "", start: -1 };
  if (typeof text !== "string") return inactive;

  const position = typeof caret === "number" && caret >= 0
    ? Math.min(caret, text.length)
    : text.length;

  const lineStart = text.lastIndexOf("\n", position - 1) + 1;
  if (text[lineStart] !== "/") return inactive;

  const query = text.slice(lineStart + 1, position);
  if (!TRIGGER_PATTERN.test(query)) return inactive;

  return { active: true, query, start: lineStart };
}

/**
 * Replaces an active `/slash` trigger with a prompt body.
 *
 * @param {string} text - The current composer text.
 * @param {{start: number, query: string}} trigger - From `detectSlashTrigger`.
 * @param {string} body - The prompt body to insert.
 * @returns {{text: string, caret: number, selection: {start: number, end: number}|null}}
 *   The new text, where the caret should land, and the first placeholder's
 *   range (so it can be selected), if any.
 */
export function insertPromptBody(text, trigger, body) {
  const source = typeof text === "string" ? text : "";
  const insertion = typeof body === "string" ? body : "";
  const start = trigger?.start ?? 0;
  const end = start + 1 + (trigger?.query?.length ?? 0);

  const nextText = source.slice(0, start) + insertion + source.slice(end);

  PLACEHOLDER_PATTERN.lastIndex = 0;
  const firstPlaceholder = PLACEHOLDER_PATTERN.exec(insertion);
  PLACEHOLDER_PATTERN.lastIndex = 0;

  if (firstPlaceholder) {
    const selectionStart = start + firstPlaceholder.index;
    return {
      text: nextText,
      caret: selectionStart,
      selection: {
        start: selectionStart,
        end: selectionStart + firstPlaceholder[0].length,
      },
    };
  }

  return {
    text: nextText,
    caret: start + insertion.length,
    selection: null,
  };
}

/**
 * Adds or replaces a prompt in a library, without mutating the input.
 *
 * @param {Array<Object>} prompts - The current library.
 * @param {Object} prompt - The prompt to save.
 * @returns {Array<Object>} The updated library.
 */
export function upsertPrompt(prompts, prompt) {
  const normalized = normalizePrompt(prompt);
  if (!normalized) return normalizeLibrary(prompts);

  const library = normalizeLibrary(prompts);
  const index = library.findIndex((entry) => entry.id === normalized.id);

  if (index === -1) return [...library, normalized];

  const next = [...library];
  next[index] = normalized;
  return next;
}

/**
 * Removes a prompt by id.
 *
 * @param {Array<Object>} prompts - The current library.
 * @param {string} id - The prompt id to remove.
 * @returns {Array<Object>} The updated library.
 */
export function removePrompt(prompts, id) {
  return normalizeLibrary(prompts).filter((prompt) => prompt.id !== id);
}
