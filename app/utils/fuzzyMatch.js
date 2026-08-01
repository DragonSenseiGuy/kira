/**
 * @file fuzzyMatch.js
 * @description Small subsequence fuzzy matcher used by the command palette.
 *
 * Optimised for short haystacks (command labels, conversation titles) so it
 * can run over every candidate on every keystroke without a worker or an index.
 */

const WORD_BOUNDARY = /[\s\-_/.:,()[\]]/;

/** True when `index` starts a word (string start or preceded by a separator). */
function startsWord(text, index) {
  return index === 0 || WORD_BOUNDARY.test(text[index - 1]);
}

/** Rewards tighter candidates so the same match in a shorter label wins. */
function tightnessBonus(length) {
  return Math.max(0, 12 - Math.floor(length / 8));
}

/**
 * Matches `query` against `text` as an ordered subsequence.
 *
 * Scoring rewards, in order of weight: matching at the very start, matching at
 * word boundaries, and runs of consecutive characters. Gaps cost points, so
 * "cmdp" ranks "Command Palette" above "Compressed Dump".
 *
 * @param {string} text - The candidate string.
 * @param {string} query - The user's (possibly abbreviated) query.
 * @returns {{score: number, positions: number[]}|null} Match info, or null if
 *   the query is not a subsequence of the text.
 */
export function fuzzyMatch(text, query) {
  if (typeof text !== "string") return null;
  if (typeof query !== "string" || query.length === 0) {
    return { score: 0, positions: [] };
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  // Contiguous substring hit. Where it lands matters a lot: a prefix or a
  // word start is a deliberate match, whereas a hit buried mid-word
  // ("ti" inside "Contribution") is usually incidental and must not outrank
  // a meaningful acronym match found on the subsequence path below.
  const substringIndex = haystack.indexOf(needle);
  if (substringIndex !== -1) {
    const positions = [];
    for (let i = 0; i < needle.length; i++) positions.push(substringIndex + i);

    let score = 50 + needle.length * 6;
    if (substringIndex === 0) score += 60;
    else if (WORD_BOUNDARY.test(haystack[substringIndex - 1])) score += 40;
    score -= Math.min(substringIndex, 20);
    score += tightnessBonus(haystack.length);

    return { score, positions };
  }

  const positions = [];
  let score = 0;
  let textIndex = 0;
  let lastMatchIndex = -2;
  let allAtWordStarts = true;

  for (let q = 0; q < needle.length; q++) {
    const char = needle[q];
    if (char === " ") continue; // spaces in the query are separators, not chars

    let found = -1;
    while (textIndex < haystack.length) {
      if (haystack[textIndex] === char) {
        found = textIndex;
        break;
      }
      textIndex++;
    }

    if (found === -1) return null;

    const atWordStart = startsWord(haystack, found);
    const isRun = found === lastMatchIndex + 1;

    if (found === 0) score += 20;
    else if (atWordStart) score += 12;

    if (isRun) score += 8; // consecutive run
    else score -= Math.min(found - lastMatchIndex - 1, 6); // gap penalty

    // A true acronym match has *every* character opening a word. Allowing
    // run characters here would let "chat" pose as an acronym of
    // "copy html attachment" and outrank the literal substring in "new chat".
    if (!atWordStart) allAtWordStarts = false;

    positions.push(found);
    lastMatchIndex = found;
    textIndex = found + 1;
  }

  // Acronym match ("ti" → "Toggle Incognito"): every character opened a word.
  if (allAtWordStarts && positions.length > 1) {
    score += 40 + positions.length * 10;
  }

  // Prefer tighter candidates: the same match in a shorter string is better.
  score += tightnessBonus(haystack.length);

  return { score, positions };
}

/**
 * Filters and ranks a list of items by fuzzy-matching one of their fields.
 *
 * @param {Array<Object>} items - Candidates.
 * @param {string} query - The user query. Empty returns items unchanged.
 * @param {Object} [options]
 * @param {(item: Object) => string} [options.key] - Extracts the text to match.
 * @param {number} [options.limit=Infinity] - Maximum results.
 * @returns {Array<Object>} `{ item, score, positions }`, best first. When the
 *   query is empty, scores are 0 and the original order is preserved.
 */
export function fuzzyFilter(items, query, options = {}) {
  const { key = (item) => item?.label ?? "", limit = Infinity } = options;
  const list = Array.isArray(items) ? items : [];

  if (!query || !query.trim()) {
    return list.slice(0, limit).map((item) => ({ item, score: 0, positions: [] }));
  }

  const matched = [];
  for (const item of list) {
    const result = fuzzyMatch(key(item), query);
    if (result) matched.push({ item, score: result.score, positions: result.positions });
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, limit);
}

/**
 * Splits text into alternating plain/matched segments for rendering.
 *
 * @param {string} text - The original text.
 * @param {number[]} positions - Matched character indices (ascending).
 * @returns {Array<{text: string, match: boolean}>} Ordered segments.
 */
export function highlightSegments(text, positions) {
  if (typeof text !== "string" || !text) return [];
  if (!Array.isArray(positions) || positions.length === 0) {
    return [{ text, match: false }];
  }

  const marked = new Set(positions);
  const segments = [];
  let buffer = "";
  let bufferMatch = marked.has(0);

  for (let i = 0; i < text.length; i++) {
    const isMatch = marked.has(i);
    if (isMatch !== bufferMatch) {
      if (buffer) segments.push({ text: buffer, match: bufferMatch });
      buffer = "";
      bufferMatch = isMatch;
    }
    buffer += text[i];
  }

  if (buffer) segments.push({ text: buffer, match: bufferMatch });

  return segments;
}
