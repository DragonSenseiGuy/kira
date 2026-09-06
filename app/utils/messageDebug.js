/**
 * @file messageDebug.js
 * @description Builds a diagnostic report for an assistant message —
 * identity, timings, usage, part structure and tool calls — for the
 * "Copy debug info" action.
 *
 * Deliberately NOT a transcript. The plain "Copy message" button already
 * copies the text; a debug dump that repeats the full body once as CONTENT,
 * again inside PARTS and a third time inside a raw JSON blob just fills the
 * clipboard with prose nobody is going to read. Long bodies are therefore
 * truncated to a short head-and-tail preview, and the byte count is reported
 * so nothing about the message's real size is hidden.
 *
 * Pure formatter: no Vue, no storage access.
 */

/** Longest preview kept for a text body (content, reasoning). */
const TEXT_PREVIEW_LIMIT = 400;

/** Longest preview kept for tool arguments and tool results. */
const TOOL_PREVIEW_LIMIT = 500;

function section(title, body) {
  if (body === undefined || body === null || body === "") return "";
  return `\n${"=".repeat(4)} ${title} ${"=".repeat(4)}\n${body}\n`;
}

/**
 * Shortens a long string to a head + tail preview, annotated with the
 * number of characters that were dropped.
 *
 * @param {string} text
 * @param {number} limit - Characters to keep in total.
 * @returns {string}
 */
function preview(text, limit) {
  const str = String(text ?? "");
  if (str.length <= limit) return str;
  const head = str.slice(0, Math.ceil(limit * 0.75));
  const tail = str.slice(-Math.floor(limit * 0.25));
  const dropped = str.length - head.length - tail.length;
  return `${head}\n… [${dropped} chars omitted, ${str.length} total] …\n${tail}`;
}

/** "1,204 chars" — the size line that replaces a dumped body. */
function sizeOf(text) {
  return `${String(text ?? "").length.toLocaleString("en-US")} chars`;
}

function formatTool(t) {
  const name = t?.function?.name || t?.name || t?.id || "unknown";
  let args = t?.function?.arguments ?? "";
  try {
    args = JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    /* keep raw */
  }
  let result = t?.result;
  if (result !== undefined && result !== null && typeof result !== "string") {
    try {
      result = JSON.stringify(result, null, 2);
    } catch {
      result = String(result);
    }
  }
  let out = `— ${name} (id: ${t?.id || "?"})`;
  if (args && args.trim() && args.trim() !== "{}") {
    out += `\n  args: ${preview(args, TOOL_PREVIEW_LIMIT)}`;
  }
  if (result !== undefined && result !== null && result !== "") {
    out += `\n  result: ${preview(String(result), TOOL_PREVIEW_LIMIT)}`;
  }
  return out;
}

/**
 * Describes the shape of the message rather than reprinting it: one line
 * per part with its type and size, plus full detail for tool groups (which
 * is the part people actually open this dump to inspect).
 */
function partsSummary(msg) {
  if (!Array.isArray(msg.parts) || msg.parts.length === 0) return "";
  return msg.parts
    .map((part, i) => {
      switch (part.type) {
        case "reasoning":
          return `[${i}] reasoning · ${sizeOf(part.content)}`;
        case "content":
          return `[${i}] content · ${sizeOf(part.content)}`;
        case "tool_group": {
          const tools = part.tools || [];
          const detail = tools.map(formatTool).join("\n");
          return `[${i}] tools · ${tools.length}${detail ? `\n${detail}` : ""}`;
        }
        case "image": {
          const images = part.images || [];
          return `[${i}] image · ${images.length}`;
        }
        default:
          return `[${i}] ${String(part.type)}`;
      }
    })
    .join("\n");
}

function legacyTools(msg) {
  const tools = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  if (!tools.length) return "";
  return tools.map(formatTool).join("\n");
}

/**
 * @param {Object} message
 * @returns {string} Multi-section plaintext diagnostic report.
 */
export function buildMessageDebugDump(message) {
  if (!message) return "";

  const meta = [
    `role: ${message.role || "?"}`,
    message.id ? `id: ${message.id}` : null,
    message.model ? `model: ${message.model}` : null,
    message.timestamp ? `created: ${new Date(message.timestamp).toISOString()}` : null,
    message.complete !== undefined ? `complete: ${!!message.complete}` : null,
    message.apiCallTime
      ? `api call at: ${new Date(message.apiCallTime).toISOString()}`
      : null,
    message.firstTokenTime
      ? `first token: ${new Date(message.firstTokenTime).toISOString()}`
      : null,
    message.completionTime
      ? `completed: ${new Date(message.completionTime).toISOString()}`
      : null,
    message.reasoningDuration != null
      ? `reasoning duration: ${Math.round(message.reasoningDuration / 100) / 10}s`
      : null,
    message.content ? `content size: ${sizeOf(message.content)}` : null,
    message.reasoning ? `reasoning size: ${sizeOf(message.reasoning)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const usage = [];
  if (message.promptTokens != null) usage.push(`prompt: ${message.promptTokens}`);
  if (message.tokenCount != null) usage.push(`completion: ${message.tokenCount}`);
  if (message.totalTokens != null) usage.push(`total: ${message.totalTokens}`);

  const sections = [
    section("MESSAGE", meta),
    usage.length ? section("USAGE", usage.join(", ")) : "",
    section("PARTS", partsSummary(message)),
    section("TOOL_CALLS", legacyTools(message)),
    message.errorDetails
      ? section(
          "ERROR",
          `${message.errorDetails.name || "Error"}: ${message.errorDetails.message || ""}` +
            (message.errorDetails.status ? ` (HTTP ${message.errorDetails.status})` : ""),
        )
      : "",
    message.reasoning
      ? section("REASONING (preview)", preview(message.reasoning, TEXT_PREVIEW_LIMIT))
      : "",
    message.content
      ? section("CONTENT (preview)", preview(message.content, TEXT_PREVIEW_LIMIT))
      : "",
  ];

  return sections.filter(Boolean).join("\n").trimEnd() + "\n";
}
