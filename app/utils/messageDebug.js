/**
 * @file messageDebug.js
 * @description Builds a diagnostic report for an assistant message —
 * identity, timings, usage, part structure and tool calls — for the
 * "Copy debug info" action.
 *
 * Deliberately NOT a transcript. The plain "Copy message" button already
 * copies the text; a debug dump that repeats the full body once as CONTENT,
 * again inside PARTS and a third time inside a raw JSON blob just fills the
 * clipboard with prose nobody is going to read. Every body is therefore
 * reported exactly once, as a size plus a head-and-tail preview, so the
 * message's real length is visible without pasting all of it.
 *
 * `parts` is the canonical structure for an assistant message: streaming
 * builds it through PartsBuilder, and ChatPanel renders it. The flat
 * `content`/`reasoning` fields are a mirror written alongside it, and are
 * only used for legacy messages stored before parts existed — so they are
 * reported here ONLY when there are no parts, rather than duplicating them.
 *
 * Note that a truncated preview of tool arguments is no longer valid JSON;
 * this report is for reading, not for feeding back into a parser.
 *
 * Pure formatter: no Vue, no storage access.
 */

/** Longest preview kept for any text — body, reasoning, tool args, results. */
const PREVIEW_LIMIT = 500;

function section(title, body) {
  if (body === undefined || body === null || body === "") return "";
  return `\n${"=".repeat(4)} ${title} ${"=".repeat(4)}\n${body}\n`;
}

/**
 * Measures a string and, when it is too long to include whole, shortens it
 * to a head + tail preview. Size is always reported, so truncation never
 * hides how big the real value was.
 *
 * @param {string} text
 * @returns {{size: string, body: string}} e.g. `{ size: "1,204 chars", ... }`
 */
function describe(text) {
  const str = String(text ?? "");
  const size = `${str.length.toLocaleString("en-US")} chars`;
  if (str.length <= PREVIEW_LIMIT) return { size, body: str };

  // Head-heavy: the start of a body identifies it, the tail only has to
  // show how it ended (a cut-off sentence, a stack trace, a stop token).
  const head = str.slice(0, Math.ceil(PREVIEW_LIMIT * 0.75));
  const tail = str.slice(-Math.floor(PREVIEW_LIMIT * 0.25));
  const dropped = str.length - head.length - tail.length;
  return { size, body: `${head}\n… [${dropped} chars omitted] …\n${tail}` };
}

/** Indents a block so it reads as detail belonging to the line above it. */
function indent(text, pad = "    ") {
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

/** `label · 1,204 chars` followed by the indented preview. */
function describedBlock(label, text, pad) {
  const { size, body } = describe(text);
  const head = `${label} · ${size}`;
  return body ? `${head}\n${indent(body, pad)}` : head;
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
    out += `\n  ${describedBlock("args", args, "    ")}`;
  }
  if (result !== undefined && result !== null && result !== "") {
    out += `\n  ${describedBlock("result", result, "    ")}`;
  }
  return out;
}

/**
 * One line per part with its type and size, each text part followed by a
 * single preview, plus full detail for tool groups (which is the part
 * people actually open this dump to inspect).
 */
function partsSummary(msg) {
  if (!Array.isArray(msg.parts) || msg.parts.length === 0) return "";
  return msg.parts
    .map((part, i) => {
      switch (part.type) {
        case "reasoning":
        case "content":
          return describedBlock(`[${i}] ${part.type}`, part.content);
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
  ]
    .filter(Boolean)
    .join("\n");

  const usage = [];
  if (message.promptTokens != null) usage.push(`prompt: ${message.promptTokens}`);
  if (message.tokenCount != null) usage.push(`completion: ${message.tokenCount}`);
  if (message.totalTokens != null) usage.push(`total: ${message.totalTokens}`);

  // Flat bodies are a mirror of the content/reasoning parts; only report
  // them when there is no parts array to report instead.
  const hasParts = Array.isArray(message.parts) && message.parts.length > 0;

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
    !hasParts && message.reasoning
      ? section("REASONING", describedBlock("reasoning", message.reasoning, ""))
      : "",
    !hasParts && message.content
      ? section("CONTENT", describedBlock("content", message.content, ""))
      : "",
  ];

  return sections.filter(Boolean).join("\n").trimEnd() + "\n";
}
