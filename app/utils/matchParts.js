/**
 * Splits text around every case-insensitive occurrence of a query, so the
 * matching pieces can be emphasised.
 *
 * @param {string} text
 * @param {string} query
 * @returns {{ text: string, match: boolean }[]}
 */
export function matchParts(text, query) {
  const source = text ?? "";
  const needle = (query ?? "").trim().toLowerCase();
  if (!needle) return [{ text: source, match: false }];

  // Lower-casing can change a string's length (İ becomes two characters), so
  // positions found in the lower-cased copy would not line up with the text.
  const haystack = source.toLowerCase();
  if (haystack.length !== source.length) return [{ text: source, match: false }];

  const parts = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push({ text: source.slice(from, at), match: false });
    parts.push({ text: source.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < source.length || !parts.length) parts.push({ text: source.slice(from), match: false });
  return parts;
}
