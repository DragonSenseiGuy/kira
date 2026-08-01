/**
 * @file messageSearch.js
 * @description Full-text search across stored conversations.
 *
 * The sidebar only ever matched conversation titles, which is useless once you
 * have a few hundred "Untitled"-ish threads. This module searches the message
 * bodies themselves and returns ranked, snippet-highlighted hits.
 *
 * Everything here is pure: it takes plain conversation objects (the shape
 * `loadConversation` returns) and returns plain results. Storage access lives
 * in `useMessageSearch.js` so this stays trivially testable.
 */

/** Roles that carry text a user would ever want to search for. */
const SEARCHABLE_ROLES = new Set(["user", "assistant"]);

/**
 * Extracts the searchable plain text from a stored message.
 *
 * Assistant messages keep their prose in `parts`; older messages only have
 * `content`. Reasoning is opt-in because it is long, rambly, and would
 * otherwise dominate every result list.
 *
 * @param {Object} message - A stored message object.
 * @param {Object} [options]
 * @param {boolean} [options.includeReasoning=false] - Include reasoning traces.
 * @returns {string} The concatenated searchable text.
 */
export function getMessageText(message, options = {}) {
  if (!message) return "";
  // Pre-extracted index entries carry their text directly.
  if (typeof message.text === "string") return message.text;

  const { includeReasoning = false } = options;

  const chunks = [];

  const pushContent = (value) => {
    if (typeof value === "string") {
      if (value.trim()) chunks.push(value);
      return;
    }
    // Multimodal content arrays: keep only the text segments.
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && entry.type === "text" && typeof entry.text === "string") {
          if (entry.text.trim()) chunks.push(entry.text);
        }
      }
    }
  };

  if (message.role === "assistant" && Array.isArray(message.parts) && message.parts.length > 0) {
    for (const part of message.parts) {
      if (!part) continue;
      if (part.type === "content") pushContent(part.content);
      else if (part.type === "reasoning" && includeReasoning) pushContent(part.content);
    }
    // Parts-based messages sometimes still carry a legacy `content` mirror of
    // the same prose. Only fall back to it when parts produced nothing.
    if (chunks.length === 0) pushContent(message.content);
  } else {
    pushContent(message.content);
    if (includeReasoning) pushContent(message.reasoning);
  }

  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      if (attachment?.filename) chunks.push(attachment.filename);
    }
  }

  return chunks.join("\n\n");
}

/**
 * Splits a raw query into terms, honouring "quoted phrases".
 *
 * @param {string} query - The raw user query.
 * @returns {{terms: string[], phrases: string[]}} Lowercased terms, plus the
 *   subset that came from quotes (those must match verbatim).
 */
export function tokenizeQuery(query) {
  if (typeof query !== "string") return { terms: [], phrases: [] };

  const terms = [];
  const phrases = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match;

  while ((match = pattern.exec(query)) !== null) {
    if (match[1] !== undefined) {
      const phrase = match[1].trim().toLowerCase();
      if (phrase) {
        terms.push(phrase);
        phrases.push(phrase);
      }
    } else {
      const term = match[2].trim().toLowerCase();
      if (term) terms.push(term);
    }
  }

  // De-duplicate while preserving order so "cat cat" isn't scored twice.
  const seen = new Set();
  const uniqueTerms = terms.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));

  return { terms: uniqueTerms, phrases };
}

/**
 * Finds every occurrence of every term in a text, merged into
 * non-overlapping, ascending ranges suitable for highlighting.
 *
 * @param {string} text - The haystack.
 * @param {string[]} terms - Lowercased needles.
 * @returns {Array<{start: number, end: number}>} Merged match ranges.
 */
export function findMatchRanges(text, terms) {
  if (!text || !Array.isArray(terms) || terms.length === 0) return [];

  const haystack = text.toLowerCase();
  const raw = [];

  for (const term of terms) {
    if (!term) continue;
    let index = haystack.indexOf(term);
    while (index !== -1) {
      raw.push({ start: index, end: index + term.length });
      index = haystack.indexOf(term, index + 1);
    }
  }

  if (raw.length === 0) return [];

  raw.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const last = merged[merged.length - 1];
    const current = raw[i];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Checks whether a match range sits on word boundaries, which is a much
 * stronger signal than an incidental substring hit ("art" in "start").
 */
function isWholeWord(text, start, end) {
  const before = start > 0 ? text[start - 1] : " ";
  const after = end < text.length ? text[end] : " ";
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
}

/**
 * Scores how well a text matches a set of terms.
 *
 * Returns 0 when any term is missing — search is AND-based, which is what
 * people expect when they type two words.
 *
 * @param {string} text - The text to score.
 * @param {string[]} terms - Lowercased terms.
 * @returns {number} A non-negative relevance score (0 = no match).
 */
export function scoreMatch(text, terms) {
  if (!text || !Array.isArray(terms) || terms.length === 0) return 0;

  const haystack = text.toLowerCase();
  let score = 0;

  for (const term of terms) {
    let count = 0;
    let hasWholeWord = false;
    let index = haystack.indexOf(term);
    const firstIndex = index;

    while (index !== -1) {
      count++;
      if (!hasWholeWord && isWholeWord(haystack, index, index + term.length)) {
        hasWholeWord = true;
      }
      if (count >= 8) break; // diminishing returns; stop counting
      index = haystack.indexOf(term, index + term.length);
    }

    if (count === 0) return 0; // AND semantics

    if (hasWholeWord) score += 3;
    score += Math.min(count, 8);
    if (firstIndex < 80) score += 2; // matched near the top of the message
  }

  // Proximity bonus: all terms clustered inside a short window reads as a
  // genuine phrase match rather than two unrelated mentions.
  if (terms.length > 1) {
    const firsts = terms.map((t) => haystack.indexOf(t));
    const spread = Math.max(...firsts) - Math.min(...firsts);
    if (spread < 80) score += 4;
  }

  // Shorter texts with the same hits are more "on topic" than a wall of text.
  score += Math.max(0, 3 - Math.floor(haystack.length / 2000));

  return score;
}

/**
 * Builds a highlighted excerpt centred on the first match.
 *
 * @param {string} text - The full text.
 * @param {string[]} terms - Lowercased terms.
 * @param {Object} [options]
 * @param {number} [options.maxLength=180] - Target snippet length.
 * @param {number} [options.leadIn=40] - Characters of context before the match.
 * @returns {{text: string, ranges: Array<{start: number, end: number}>, prefixed: boolean, suffixed: boolean}}
 */
export function buildSnippet(text, terms, options = {}) {
  const { maxLength = 180, leadIn = 40 } = options;
  const normalized = (text || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return { text: "", ranges: [], prefixed: false, suffixed: false };
  }

  const ranges = findMatchRanges(normalized, terms);

  if (normalized.length <= maxLength) {
    return { text: normalized, ranges, prefixed: false, suffixed: false };
  }

  const anchor = ranges.length > 0 ? ranges[0].start : 0;
  let start = Math.max(0, anchor - leadIn);
  let end = Math.min(normalized.length, start + maxLength);
  // Re-pull the window left if we bumped into the end of the text.
  start = Math.max(0, Math.min(start, end - maxLength));

  // Snap to word boundaries so snippets don't start mid-word.
  if (start > 0) {
    const space = normalized.indexOf(" ", start);
    if (space !== -1 && space < start + 20) start = space + 1;
  }
  if (end < normalized.length) {
    const space = normalized.lastIndexOf(" ", end);
    if (space !== -1 && space > end - 20) end = space;
  }

  const sliced = normalized.slice(start, end);
  const shifted = ranges
    .filter((r) => r.end > start && r.start < end)
    .map((r) => ({
      start: Math.max(0, r.start - start),
      end: Math.min(sliced.length, r.end - start),
    }));

  return {
    text: sliced,
    ranges: shifted,
    prefixed: start > 0,
    suffixed: end < normalized.length,
  };
}

/**
 * Splits a snippet into alternating plain/highlighted segments, ready for
 * rendering without `v-html`.
 *
 * @param {{text: string, ranges: Array<{start: number, end: number}>}} snippet
 * @returns {Array<{text: string, match: boolean}>} Ordered segments.
 */
export function snippetSegments(snippet) {
  if (!snippet || !snippet.text) return [];
  const { text, ranges = [] } = snippet;
  if (ranges.length === 0) return [{ text, match: false }];

  const segments = [];
  let cursor = 0;

  for (const range of ranges) {
    const start = Math.max(cursor, range.start);
    const end = Math.min(text.length, range.end);
    if (end <= start) continue;
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });

  return segments;
}

/**
 * Reduces a stored conversation record to a compact, searchable index entry.
 *
 * Stored conversations embed base64 attachments, tool payloads, and timing
 * metadata; keeping all of that in memory for search would be wasteful. This
 * keeps only ids, roles, and plain text.
 *
 * @param {string} id - The conversation id.
 * @param {Object} record - The stored `{ title, lastUpdated, messages }` record.
 * @param {Object} [options]
 * @param {boolean} [options.includeReasoning=false] - Index reasoning traces.
 * @returns {{id: string, title: string, lastUpdated: *, messages: Array}} Index entry.
 */
export function buildConversationIndex(id, record, options = {}) {
  const { includeReasoning = false } = options;
  const messages = [];

  for (const message of record?.messages ?? []) {
    if (!message || !SEARCHABLE_ROLES.has(message.role)) continue;
    const text = getMessageText(message, { includeReasoning });
    if (!text) continue;
    messages.push({
      id: message.id,
      role: message.role,
      timestamp: message.timestamp ?? null,
      text,
    });
  }

  return {
    id,
    title: record?.title || "Untitled",
    lastUpdated: record?.lastUpdated ?? null,
    messages,
  };
}

/**
 * Searches message bodies across many conversations.
 *
 * @param {Array<Object>} conversations - `{ id, title, lastUpdated, messages }`.
 * @param {string} query - The raw user query.
 * @param {Object} [options]
 * @param {number} [options.limit=40] - Maximum results returned overall.
 * @param {number} [options.perConversation=3] - Maximum results per conversation.
 * @param {boolean} [options.includeReasoning=false] - Search reasoning traces too.
 * @param {number} [options.snippetLength=180] - Snippet length.
 * @returns {Array<Object>} Ranked results, best first.
 */
export function searchConversations(conversations, query, options = {}) {
  const {
    limit = 40,
    perConversation = 3,
    includeReasoning = false,
    snippetLength = 180,
  } = options;

  const { terms } = tokenizeQuery(query);
  if (terms.length === 0 || !Array.isArray(conversations)) return [];

  const results = [];

  for (const conversation of conversations) {
    if (!conversation || !Array.isArray(conversation.messages)) continue;

    const perConvoHits = [];

    for (const message of conversation.messages) {
      if (!message || !SEARCHABLE_ROLES.has(message.role)) continue;

      const text = getMessageText(message, { includeReasoning });
      if (!text) continue;

      const score = scoreMatch(text, terms);
      if (score <= 0) continue;

      perConvoHits.push({
        conversationId: conversation.id,
        conversationTitle: conversation.title || "Untitled",
        lastUpdated: conversation.lastUpdated ?? null,
        messageId: message.id,
        role: message.role,
        timestamp: message.timestamp ?? null,
        score,
        snippet: buildSnippet(text, terms, { maxLength: snippetLength }),
      });
    }

    perConvoHits.sort((a, b) => b.score - a.score);
    results.push(...perConvoHits.slice(0, perConversation));
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
    const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
    return dateB - dateA;
  });

  return results.slice(0, limit);
}
