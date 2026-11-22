// Sidebar search that looks inside chats, not only at their titles.

const CONTEXT_BEFORE = 24;
const CONTEXT_AFTER = 60;

// The words a person wrote or read in one message. Reasoning, tool output and
// attachments are left out: they are not what someone remembers a chat by.
export function messageText(message) {
  if (!message || (message.role !== "user" && message.role !== "assistant")) {
    return "";
  }
  const { content } = message;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

// The first place the query appears in a chat, with a little text either side,
// or null when it does not appear. The match is case-insensitive.
export function findSnippet(messages, query) {
  const needle = (query || "").trim().toLowerCase();
  if (!needle) return null;

  for (const message of messages || []) {
    const text = messageText(message).replace(/\s+/g, " ");
    // Lowercasing can change a string's length (e.g. "İ"), which would shift
    // the offsets; such a message is searched as written instead.
    const lower = text.toLowerCase();
    const haystack = lower.length === text.length ? lower : text;
    const at = haystack.indexOf(needle);
    if (at === -1) continue;

    const start = Math.max(0, at - CONTEXT_BEFORE);
    const end = Math.min(text.length, at + needle.length + CONTEXT_AFTER);
    return {
      before: (start > 0 ? "…" : "") + text.slice(start, at),
      match: text.slice(at, at + needle.length),
      after: text.slice(at + needle.length, end) + (end < text.length ? "…" : ""),
    };
  }
  return null;
}
