/**
 * The web pages an assistant message drew on: the results of every web
 * search it ran, without duplicates, with the pages the answer links to
 * listed first.
 */

function webUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Two addresses of the same page compare equal by this key. */
function pageKey(url) {
  return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
}

function searchResults(tool) {
  if (tool?.function?.name !== "search" || typeof tool.result !== "string") return [];
  try {
    const results = JSON.parse(tool.result)?.results;
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

/**
 * @param {Object} message - A stored assistant message.
 * @returns {{ url: string, title: string, domain: string, cited: boolean }[]}
 */
export function messageSources(message) {
  if (message?.role !== "assistant") return [];
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const tools = parts.length
    ? parts.flatMap((part) => (part?.type === "tool_group" && Array.isArray(part.tools) ? part.tools : []))
    : Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [];
  const text = parts.length
    ? parts.map((part) => (part?.type === "content" && typeof part.content === "string" ? part.content : "")).join("\n")
    : typeof message.content === "string"
      ? message.content
      : "";
  const linked = new Set(
    (text.match(/https?:\/\/[^\s<>"')\]]+/gi) || []).map((found) => webUrl(found.replace(/[.,;:!?]+$/, ""))).filter(Boolean).map(pageKey),
  );

  const sources = new Map();
  for (const result of tools.flatMap(searchResults)) {
    const url = webUrl(result?.url);
    if (!url) continue;
    const key = pageKey(url);
    if (sources.has(key)) continue;
    const domain = url.hostname.replace(/^www\./, "");
    const title = typeof result.title === "string" && result.title.trim() ? result.title.trim() : domain;
    sources.set(key, { url: url.href, title, domain, cited: linked.has(key) });
  }
  const all = [...sources.values()];
  return [...all.filter((source) => source.cited), ...all.filter((source) => !source.cited)];
}
