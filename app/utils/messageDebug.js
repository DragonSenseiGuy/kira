/**
 * @file messageDebug.js
 * @description Builds a human-readable full dump of an assistant message —
 * content, reasoning, every tool call with arguments/results, timing and
 * usage — for the "Copy debug info" action.
 *
 * Pure formatter: no Vue, no storage access.
 */

function section(title, body) {
  if (body === undefined || body === null || body === "") return "";
  return `\n${"=".repeat(4)} ${title} ${"=".repeat(4)}\n${body}\n`;
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
  if (args && args.trim() && args.trim() !== "{}") out += `\n  args: ${args}`;
  if (result !== undefined && result !== null && result !== "") {
    const trimmed = String(result);
    out += `\n  result: ${trimmed}`;
  }
  return out;
}

function partsSummary(msg) {
  if (!Array.isArray(msg.parts)) return "";
  const blocks = [];
  msg.parts.forEach((part, i) => {
    switch (part.type) {
      case "reasoning":
        blocks.push(`[${i}] REASONING\n${part.content || ""}`);
        break;
      case "content":
        blocks.push(`[${i}] CONTENT\n${part.content || ""}`);
        break;
      case "tool_group":
        blocks.push(
          `[${i}] TOOLS\n${(part.tools || []).map(formatTool).join("\n")}`,
        );
        break;
      case "image":
        blocks.push(
          `[${i}] IMAGE\n${(part.images || [])
            .map((im) => im.url)
            .join("\n")}`,
        );
        break;
      default:
        blocks.push(`[${i}] ${String(part.type).toUpperCase()}`);
    }
  });
  return blocks.join("\n\n");
}

function legacyTools(msg) {
  const tools = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  if (!tools.length) return "";
  return tools.map(formatTool).join("\n");
}

/**
 * @param {Object} message
 * @returns {string} Multi-section plaintext dump.
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
  ]
    .filter(Boolean)
    .join("\n");

  const usage = [];
  if (message.promptTokens != null) usage.push(`prompt: ${message.promptTokens}`);
  if (message.tokenCount != null) usage.push(`completion: ${message.tokenCount}`);
  if (message.totalTokens != null) usage.push(`total: ${message.totalTokens}`);

  const sections = [
    section("MESSAGE", meta),
    message.reasoning ? section("REASONING", message.reasoning) : "",
    message.content ? section("CONTENT", message.content) : "",
    section("PARTS", partsSummary(message)),
    section("TOOL_CALLS", legacyTools(message)),
    message.errorDetails
      ? section(
          "ERROR",
          `${message.errorDetails.name || "Error"}: ${message.errorDetails.message || ""}` +
            (message.errorDetails.status ? ` (HTTP ${message.errorDetails.status})` : ""),
        )
      : "",
    usage.length ? section("USAGE", usage.join(", ")) : "",
    section("RAW JSON", JSON.stringify(stripVolatile(message), null, 2)),
  ];

  return sections.filter(Boolean).join("\n").trimEnd() + "\n";
}

/** Drops fields that bloat or can't serialize cleanly. */
function stripVolatile(message) {
  const clone = {};
  for (const [key, value] of Object.entries(message)) {
    if (key === "_raw" || key === "executed_tools") continue;
    try {
      JSON.stringify(value);
      clone[key] = value;
    } catch {
      clone[key] = String(value);
    }
  }
  return clone;
}
