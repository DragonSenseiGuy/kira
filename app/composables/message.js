/**
 * @file message.js
 * @description Core logic for the Kira API Interface, handling Hack Club LLM endpoint configuration
 * and streaming responses using manual fetch() processing.
 * 
 * Tool Calling Architecture (Industry Standard):
 * - One assistant message per turn contains ALL parts (content, tool_calls, tool_results)
 * - Agent loop: Stream → Detect Tool Calls → Execute → Continue Stream
 * - Clean separation between streaming accumulation and message formatting
 */

import {
  DEFAULT_MODEL_ID,
  buildReasoningParams,
} from "~/composables/availableModels";
import { findFullModelById } from "~/composables/providers";
import { generateSystemPrompt } from "~/composables/systemPrompt";
import { toolManager } from "~/composables/toolsManager";
import { postChatCompletion } from "~/composables/apiClient";
import { resolveChatTarget } from "~/composables/providers";

/**
 * Typed error for failures reported inside the SSE stream (or by the
 * proxy). Carries structured details so the UI can render exactly one
 * canonical error block instead of stacking duplicated error text.
 */
class StreamError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "StreamError";
    this.details = details || { name: "APIError", message };
  }
}

/**
 * Formats a message object for the API, handling multimodal content including:
 * - User attachments (images, PDFs)
 * - Assistant generated images
 * - Reasoning/thinking content
 * - Tool calls and results
 *
 * @param {Object} msg - The message object from the messages array
 * @param {Object} [options]
 * @param {boolean} [options.includeReasoning=true] - When false, reasoning is
 *   omitted from the formatted output. History replay only includes reasoning
 *   for the most recent assistant message: older thinking rarely helps the
 *   next turn and its token cost compounds on long conversations.
 * @returns {Object|Array} Formatted message(s) for the API. Returns array for assistant messages with tools.
 */
function formatMessageForAPI(msg, options = {}) {
  const includeReasoning = options.includeReasoning !== false;

  // User messages: handle attachments
  if (msg.role === "user") {
    const baseMessage = { 
      role: msg.role,
      annotations: msg.annotations 
    };
    
    if (msg.attachments && msg.attachments.length > 0) {
      const contentParts = [{ type: "text", text: msg.content || "" }];

      for (const attachment of msg.attachments) {
        if (attachment.type === "image") {
          contentParts.push({
            type: "image_url",
            image_url: { url: attachment.dataUrl },
          });
        } else if (attachment.type === "pdf") {
          contentParts.push({
            type: "file",
            file: {
              filename: attachment.filename,
              file_data: attachment.dataUrl,
            },
          });
        }
      }

      baseMessage.content = contentParts;
    } else {
      baseMessage.content = msg.content || "";
    }
    return baseMessage;
  }

  // Assistant messages: Convert parts to interleaved assistant/tool messages
  if (msg.role === "assistant") {
    return formatAssistantMessageForAPI(msg, includeReasoning);
  }

  // Tool messages (for tool results in conversation)
  // OpenAI API format: role, tool_call_id, content (no name field)
  if (msg.role === "tool") {
    return {
      role: "tool",
      tool_call_id: msg.tool_call_id,
      content: msg.content || "",
    };
  }

  // Fallback for any other role
  return {
    role: msg.role,
    content: msg.content || ""
  };
}

/**
 * Formats an assistant message for the API, converting parts to interleaved messages.
 * For true agentic behavior: content -> tool -> result -> tool -> result -> content
 *
 * @param {Object} msg - The assistant message with parts
 * @param {boolean} includeReasoning - Whether to replay reasoning as <thinking> text
 * @returns {Array} Array of API messages (assistant and tool messages interleaved)
 */
function formatAssistantMessageForAPI(msg, includeReasoning = true) {
  const messages = [];
  let currentContentParts = [];

  // Helper to build content from parts
  const buildContent = (parts) => {
    const contentParts = [];
    for (const part of parts) {
      switch (part.type) {
        case "reasoning":
          if (!includeReasoning) break;
          if (part.content && part.content.trim()) {
            contentParts.push({
              type: "text",
              text: `<thinking>\n${part.content}\n</thinking>`,
            });
          }
          break;
        case "content":
          if (part.content && part.content.trim()) {
            contentParts.push({
              type: "text",
              text: part.content,
            });
          }
          break;
        case "image":
          if (part.images && part.images.length > 0) {
            for (const img of part.images) {
              if (img.url) {
                contentParts.push({
                  type: "image_url",
                  image_url: { url: img.url },
                });
              }
            }
          }
          break;
      }
    }
    
    if (contentParts.length === 0) return null;
    if (contentParts.length === 1 && contentParts[0].type === "text") {
      return contentParts[0].text;
    }
    return contentParts;
  };
  
  // Helper to flush accumulated content as assistant message
  const flushContent = () => {
    if (currentContentParts.length === 0) return;
    
    const content = buildContent(currentContentParts);
    if (content) {
      messages.push({
        role: "assistant",
        content: content
      });
    }
    currentContentParts = [];
  };
  
  // Process parts in order
  if (msg.parts && msg.parts.length > 0) {
    for (const part of msg.parts) {
      if (part.type === "tool_group" && part.tools && part.tools.length > 0) {
        // Flush any content before the tool group
        flushContent();
        
        // For agentic behavior, interleave each tool with its result
        for (const tool of part.tools) {
          if (tool.id && tool.function) {
            // Assistant message with single tool_call
            messages.push({
              role: "assistant",
              content: "", // Content before this tool (if any was generated)
              tool_calls: [{
                id: tool.id,
                type: tool.type || "function",
                function: {
                  name: tool.function.name || "",
                  arguments: tool.function.arguments || ""
                }
              }]
            });
            
            // Tool result message (immediately after)
            if (tool.result !== undefined && tool.result !== null) {
              messages.push({
                role: "tool",
                tool_call_id: tool.id,
                content: typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result)
              });
            }
          }
        }
      } else {
        // Accumulate non-tool parts
        currentContentParts.push(part);
      }
    }
  } else {
    // No parts - use legacy formatting
    let content = msg.content || "";
    if (includeReasoning && msg.reasoning && msg.reasoning.trim()) {
      content = `<thinking>\n${msg.reasoning}\n</thinking>\n\n${content}`;
    }
    if (content.trim()) {
      currentContentParts.push({ type: "content", content });
    }
  }
  
  // Flush any remaining content
  flushContent();
  
  // If no messages created but we have tool_calls from msg, add single assistant message
  if (messages.length === 0 && msg.tool_calls && msg.tool_calls.length > 0) {
    messages.push({
      role: "assistant",
      content: msg.content || "",
      tool_calls: JSON.parse(JSON.stringify(msg.tool_calls))
    });
  }
  
  return messages;
}

/**
 * Accumulates streaming chunks and tracks tool calls
 */
class StreamAccumulator {
  constructor() {
    this.content = "";
    this.reasoning = "";
    this.toolCalls = new Map(); // index -> toolCall
    this.hasToolCalls = false;
    this.usage = null;
    this.annotations = null;
    this.images = [];
    this.finished = false;
    this.finishReason = null;
  }

  /**
   * Process a streaming chunk from the API
   */
  processChunk(chunk) {
    // Track finish reason
    if (chunk.choices?.[0]?.finish_reason) {
      this.finishReason = chunk.choices[0].finish_reason;
    }

    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;

    // Accumulate content
    if (delta.content) {
      this.content += delta.content;
    }

    // Accumulate reasoning
    if (delta.reasoning && delta.reasoning.trim() !== "None") {
      this.reasoning += delta.reasoning;
    }

    // Accumulate tool calls
    if (delta.tool_calls) {
      this.hasToolCalls = true;
      for (const toolDelta of delta.tool_calls) {
        const index = toolDelta.index;
        const existing = this.toolCalls.get(index) || {
          id: toolDelta.id,
          type: toolDelta.type || "function",
          function: { name: "", arguments: "" },
        };

        if (toolDelta.id) existing.id = toolDelta.id;
        if (toolDelta.function?.name) {
          existing.function.name = toolDelta.function.name;
        }
        if (toolDelta.function?.arguments) {
          existing.function.arguments += toolDelta.function.arguments;
        }

        this.toolCalls.set(index, existing);
      }
    }

    // Capture usage
    if (chunk.usage) {
      this.usage = chunk.usage;
    }

    // Capture annotations
    if (chunk.annotations || chunk.choices?.[0]?.message?.annotations || chunk.choices?.[0]?.delta?.annotations) {
      this.annotations = chunk.annotations || 
                        chunk.choices?.[0]?.message?.annotations || 
                        chunk.choices?.[0]?.delta?.annotations;
    }

    // Capture images
    if (delta.images) {
      this.images.push(...delta.images);
    }
  }

  /**
   * Get completed tool calls as an array
   */  getCompletedToolCalls() {
    const calls = [];
    const indices = Array.from(this.toolCalls.keys()).sort((a, b) => a - b);
    for (const index of indices) {
      calls.push(this.toolCalls.get(index));
    }
    return calls;
  }

  /**
   * Check if stream has meaningful content
   */
  hasContent() {
    return (
      this.content.trim().length > 0 ||
      this.reasoning.trim().length > 0 ||
      this.toolCalls.size > 0 ||
      this.images.length > 0
    );
  }

  /**
   * Reset for next iteration
   */
  reset() {
    this.content = "";
    this.reasoning = "";
    this.toolCalls.clear();
    this.hasToolCalls = false;
    this.usage = null;
    this.annotations = null;
    this.images = [];
    this.finished = false;
    this.finishReason = null;
  }
}

/**
 * Main entry point for processing all incoming user messages for the API interface.
 * Uses an industry-standard agent loop: stream, detect tools, execute, continue.
 * 
 * MESSAGE ASSEMBLY CONTRACT:
 * - `plainMessages` should contain conversation history WITHOUT the current user message
 * - This function ADDS the current user message to the API request
 * - This ensures no duplication between history and the current turn
 * 
 * The final messages array sent to the API is:
 *   [systemPrompt, ...plainMessages (history), { role: "user", content: query }, ...intermediateMessages]
 *
 * @param {string} query - The user's message (current turn)
 * @param {Array} plainMessages - Conversation history WITHOUT the current user message
 * @param {AbortController} controller - AbortController instance for cancelling API requests
 * @param {string} selectedModel - The model chosen by the user
 * @param {object} modelParameters - Model parameters (max_tokens, reasoning)
 * @param {object} settings - User settings object containing user_name, user_occupation, and custom_instructions
 * @param {string[]} toolNames - Array of available tool names
 * @param {boolean} isSearchEnabled - Whether the Exa search tools are enabled
 * @param {boolean} isIncognito - Whether incognito mode is enabled
 * @param {Array} attachments - Array of file attachments [{ type: 'image'|'pdf', filename, dataUrl, mimeType }]
 * @yields {Object} A chunk object with content and/or reasoning
 * @property {string|null} content - The main content of the response chunk
 * @property {string|null} reasoning - Any reasoning information included in the response chunk
 * @property {Array} tool_calls - Tool call deltas for UI updates
 * @property {Object} tool_result - Tool execution result for UI updates
 * @property {Object} usage - Token usage information
 * @property {Array} annotations - PDF annotations for reuse
 * @property {Array} images - Generated images
 * @property {boolean} iterationComplete - Signals end of one agent iteration
 * @property {boolean} canceled - The turn was stopped by the user (no content)
 **/
export async function* handleIncomingMessage(
  query,
  plainMessages,
  controller,
  selectedModel = DEFAULT_MODEL_ID,
  modelParameters = {},
  settings = {},
  toolNames = [],
  isSearchEnabled = false,
  isIncognito = false,
  attachments = [],
) {
  try {
    // Validate required parameters
    if (!query || !plainMessages || !controller) {
      throw new Error("Missing required parameters for handleIncomingMessage");
    }

    // Find the selected model info
    const selectedModelInfo = findFullModelById(selectedModel);

    // Determine which tools are actually being used
    const modelHasToolUse = selectedModelInfo?.tool_use !== false;

    const enabledToolNames = [];

    // Enable Exa search tools if search is enabled AND the user has a
    // search backend configured ('off' disables the tools entirely).
    const searchSource = settings.tool_search_source || "hackclub";
    if (modelHasToolUse && isSearchEnabled && searchSource !== "off") {
      enabledToolNames.push("search", "getPageContents");
    }

    // Code execution + workspace tools are always offered to tool-capable
    // models; they run entirely client-side and need no configuration.
    if (modelHasToolUse) {
      enabledToolNames.push(
        "run_javascript",
        "write_file",
        "append_file",
        "read_file",
        "edit_file",
        "delete_file",
        "move_file",
        "rename_file",
        "list_files",
        "search_files",
      );
    }

    // Generate system prompt based on settings and used tools
    const systemPrompt = await generateSystemPrompt(
      enabledToolNames,
      isIncognito ? {} : settings,
      isIncognito,
      modelHasToolUse,
    );

    // Build user message content based on attachments
    let userMessageContent;
    if (attachments && attachments.length > 0) {
      const contentParts = [{ type: "text", text: query }];
      for (const attachment of attachments) {
        if (attachment.type === "image") {
          contentParts.push({
            type: "image_url",
            image_url: { url: attachment.dataUrl },
          });
        } else if (attachment.type === "pdf") {
          contentParts.push({
            type: "file",
            file: {
              filename: attachment.filename,
              file_data: attachment.dataUrl,
            },
          });
        }
      }
      userMessageContent = contentParts;
    } else {
      userMessageContent = query;
    }

    // Build base messages for this user turn
    // formatMessageForAPI can return single message or array (for assistant with tools).
    // Reasoning is only replayed for the most recent assistant message — older
    // thinking adds token cost without helping the next turn.
    let lastAssistantIndex = -1;
    for (let i = plainMessages.length - 1; i >= 0; i--) {
      if (plainMessages[i]?.role === "assistant") {
        lastAssistantIndex = i;
        break;
      }
    }

    const formattedHistory = plainMessages
      .map((m, i) => formatMessageForAPICached(m, i === lastAssistantIndex))
      .flat()
      .filter((m) => m !== null);
    
    const baseMessages = [
      { role: "system", content: systemPrompt },
      ...formattedHistory,
      { role: "user", content: userMessageContent },
    ];

    // Tools configuration
    const enabledToolSchemas = enabledToolNames.length
      ? toolManager.getSchemasByNames(enabledToolNames)
      : [];
    const modelSupportsTools = modelHasToolUse && enabledToolSchemas.length > 0;

    // Agent loop configuration. Unlimited iterations by default; an
    // optional cap can be set via Settings → Search (tool_max_iterations).
    const configuredMax = Number(settings.tool_max_iterations);
    const maxToolIterations =
      Number.isFinite(configuredMax) && configuredMax >= 1 ? configuredMax : Infinity;
    let iteration = 0;

    // Accumulator for this assistant turn
    const accumulator = new StreamAccumulator();

    while (iteration < maxToolIterations) {
      iteration++;

      // Build messages for this call
      // Note: baseMessages now contains all previous turns including:
      // - system prompt
      // - conversation history
      // - current user message
      // - previous assistant messages with tool_calls
      // - previous tool results
      const messagesForThisCall = baseMessages;

      // Build request body
      const requestBody = {
        model: selectedModel,
        messages: messagesForThisCall,
        stream: true,
        ...(modelSupportsTools && {
          tools: enabledToolSchemas,
          tool_choice: "auto",
        }),
        // Output budget only — sampling params (temperature/top_p/seed) are
        // left at provider defaults on purpose.
        ...(modelParameters && {
          max_tokens: modelParameters.max_tokens,
        }),
      };

      // Multi-provider routing. Composite model IDs (`provider::model`)
      // select a user-configured OpenAI-compatible endpoint; plain IDs
      // go through the built-in Hack Club proxy.
      const chatTarget = resolveChatTarget(settings);
      requestBody.model = chatTarget.modelId;
      if (chatTarget.apiKey) {
        requestBody.customApiKey = chatTarget.apiKey;
      }
      if (chatTarget.upstreamBaseUrl && chatTarget.direct) {
        // Loopback runtimes (Ollama/LM Studio): call them straight from
        // the browser so they work even on hosted deployments.
        requestBody.directBaseUrl = chatTarget.upstreamBaseUrl;
      } else if (chatTarget.upstreamBaseUrl) {
        requestBody.upstreamBaseUrl = chatTarget.upstreamBaseUrl;
      }

      // Add reasoning parameters
      if (selectedModelInfo) {
        const userSettings = {
          reasoning_effort: modelParameters?.reasoning?.effort,
        };

        const { reasoningParams, alternateModel } = buildReasoningParams(
          selectedModelInfo,
          userSettings,
        );

        if (alternateModel) {
          requestBody.model = alternateModel;
        }

        if (reasoningParams) {
          requestBody.reasoning = reasoningParams;
        }

        if (selectedModelInfo.providers && selectedModelInfo.providers.length > 0) {
          requestBody.provider = {
            order: selectedModelInfo.providers,
          };
        }
      }

      // Make the API request through the shared proxy client. The BYOK
      // key rides in the x-api-key header; the session token is attached
      // automatically.
      const response = await postChatCompletion(requestBody, {
        signal: controller.signal,
      });

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      
      // Reset accumulator for this iteration
      accumulator.reset();
      
      // Stream timeout configuration. A stalled stream must surface as an
      // error, not look like a normal completion — canceling the reader
      // alone would make the next read() return done:true and silently
      // truncate the reply.
      const STREAM_TIMEOUT_MS = 60000;
      let streamTimeoutId = null;
      let streamTimedOut = false;

      const resetStreamTimeout = () => {
        if (streamTimeoutId) clearTimeout(streamTimeoutId);
        streamTimeoutId = setTimeout(() => {
          streamTimedOut = true;
          try {
            reader.cancel();
          } catch {
            // Reader already released - nothing to do.
          }
        }, STREAM_TIMEOUT_MS);
      };

      const clearStreamTimeout = () => {
        if (streamTimeoutId) clearTimeout(streamTimeoutId);
      };

      try {
        resetStreamTimeout();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          resetStreamTimeout();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6);
            if (data === "[DONE]") {
              accumulator.finished = true;
              break;
            }

            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch (error) {
              continue;
            }

            // Handle errors surfaced inside the stream. Throw a typed
            // error so the single catch below emits exactly ONE error
            // event — error text is never appended to message content
            // here (that caused duplicated error blocks in the UI).
            if (parsed.error) {
              throw new StreamError(
                parsed.error.message || "API error",
                {
                  name: parsed.error.type || "APIError",
                  message: parsed.error.message || "API error",
                  status: parsed.error.code,
                },
              );
            }

            // Process the chunk
            if (parsed.choices && parsed.choices[0]) {
              accumulator.processChunk(parsed);

              const delta = parsed.choices[0].delta;

              // Yield content updates
              if (delta?.content) {
                yield {
                  content: delta.content,
                  reasoning: null,
                };
              }

              // Yield reasoning updates
              if (delta?.reasoning && delta.reasoning.trim() !== "None") {
                yield {
                  content: null,
                  reasoning: delta.reasoning,
                };
              }

              // Yield tool call updates for UI
              if (delta?.tool_calls) {
                yield {
                  content: null,
                  reasoning: null,
                  tool_calls: delta.tool_calls,
                };
              }

              // Yield usage
              if (parsed.usage) {
                yield {
                  content: null,
                  reasoning: null,
                  usage: parsed.usage,
                };
              }

              // Yield images
              if (delta?.images) {
                yield {
                  content: delta.content !== undefined ? delta.content : null,
                  reasoning: null,
                  images: delta.images,
                };
              }

              // Yield annotations
              const annotations = delta?.annotations || parsed.annotations;
              if (annotations) {
                yield {
                  content: null,
                  reasoning: null,
                  annotations: annotations,
                };
              }
            }

            if (accumulator.finished) break;
          }

          if (accumulator.finished) break;
        }
      } finally {
        clearStreamTimeout();
        try {
          reader.releaseLock();
        } catch {
          // Lock already released via cancel() - nothing to do.
        }
      }

      if (streamTimedOut) {
        throw new StreamError(
          "The model stopped responding (no data for 60 seconds).",
          {
            name: "StreamTimeout",
            message: "The model stopped responding (no data for 60 seconds).",
            status: null,
          },
        );
      }

      // Check if we need to execute tools
      const completedToolCalls = accumulator.getCompletedToolCalls();

      if (!accumulator.hasToolCalls || !modelSupportsTools || completedToolCalls.length === 0) {
        // No tool calls - we're done
        break;
      }

      // CRITICAL: First add the assistant message with tool_calls to baseMessages
      // This must come BEFORE tool results to maintain correct message ordering
      baseMessages.push({
        role: "assistant",
        content: accumulator.content || "",
        tool_calls: completedToolCalls.map((tc) => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      });

      // Execute tools. Only tools that were actually OFFERED to the model
      // may run — anything else (stale/disabled/hallucinated names) gets a
      // structured refusal fed back instead of executing hidden logic.
      const allowedToolNames = new Set(enabledToolNames);
      const toolResults = await executeTools(
        completedToolCalls,
        plainMessages,
        controller.signal,
        allowedToolNames,
      );

      // User pressed Stop while tools were running - end the turn as canceled.
      if (controller.signal.aborted) {
        const abortError = new Error("Aborted during tool execution");
        abortError.name = "AbortError";
        throw abortError;
      }

      // Yield tool results for UI updates
      for (const result of toolResults) {
        yield {
          content: null,
          reasoning: null,
          tool_result: {
            id: result.tool_call_id,
            name: result.name,
            result: result.content,
          },
        };
      }

      // Add tool results to baseMessages AFTER the assistant message
      // Correct order: assistant (with tool_calls) → tool results
      const toolMessages = [];
      for (const result of toolResults) {
        const toolMsg = {
          role: "tool",
          tool_call_id: result.tool_call_id,
          name: result.name,
          content: result.content,
        };
        baseMessages.push(toolMsg);
        toolMessages.push(toolMsg);
      }

      // Yield tool messages so they can be stored in conversation history
      yield {
        iterationComplete: true,
        toolCallsExecuted: completedToolCalls.length,
        toolMessages: toolMessages,
      };
    }

    // Final yield with complete content
    yield {
      content: accumulator.content,
      reasoning: accumulator.reasoning,
      complete: true,
      finalToolCalls: accumulator.getCompletedToolCalls(),
      usage: accumulator.usage,
      annotations: accumulator.annotations,
    };

  } catch (error) {
    // Handle abort errors specifically. Cancellation is reported as a
    // dedicated event (never as content text); the UI layer appends a
    // single "stopped" marker at exactly one site.
    if (error.name === "AbortError") {
      yield { content: null, reasoning: null, canceled: true, complete: true };
      return;
    }

    // Emit exactly ONE structured error event. The UI layer is
    // responsible for rendering it once; no error text is embedded in
    // `content` so nothing can be duplicated into the message body.
    const isStreamError = error instanceof StreamError;
    const errorMessage = error.message || "No detailed information";
    yield {
      content: null,
      reasoning: null,
      error: true,
      errorDetails: isStreamError
        ? { ...error.details }
        : {
            name: error.name || "UnknownError",
            message: errorMessage,
            rawError: error.toString(),
          },
      complete: true,
    };
  }
}

/**
 * Watchdog for a single tool execution: resolves with a tagged outcome
 * when the executor finishes, the turn is aborted, or the timeout fires —
 * whichever comes first. A hung backend can no longer stall the turn.
 */
const TOOL_TIMEOUT_MS = 120000;

function runToolWithWatchdog(executorPromise, signal) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    };

    const onAbort = () => settle({ aborted: true });
    signal?.addEventListener("abort", onAbort, { once: true });

    timeoutId = setTimeout(() => settle({ timedOut: true }), TOOL_TIMEOUT_MS);

    executorPromise.then(
      (value) => settle({ value }),
      (error) => settle({ error }),
    );
  });
}

/**
 * Execute tools and return results. Independent tool calls run in
 * parallel; results keep the original call order.
 */
async function executeTools(toolCalls, messageHistory = [], signal = null, allowedNames = null) {
  const outcomes = await Promise.all(
    toolCalls.map((toolCall) =>
      runToolWithWatchdog(
        executeSingleTool(toolCall, messageHistory, allowedNames),
        signal,
      ),
    ),
  );

  // Aborted calls surface as structured tool errors here; the caller
  // checks signal.aborted afterwards to end the whole turn as canceled.
  return outcomes.map((outcome, i) => {
    if (outcome.aborted) {
      return {
        role: "tool",
        tool_call_id: toolCalls[i].id,
        name: toolCalls[i].function.name,
        content: JSON.stringify({ error: "Canceled by user" }),
      };
    }
    if (outcome.timedOut) {
      return {
        role: "tool",
        tool_call_id: toolCalls[i].id,
        name: toolCalls[i].function.name,
        content: JSON.stringify({
          error: `Tool timed out after ${TOOL_TIMEOUT_MS / 1000}s`,
        }),
      };
    }
    return outcome.value;
  });
}

async function executeSingleTool(toolCall, messageHistory, allowedNames = null) {
  const name = toolCall.function.name;

  // A single tool result that is too large can make the FOLLOW-UP request
  // unsendable (gateways answer huge tool payloads with opaque 502s). The
  // sandbox already caps its own pieces; this bounds the total envelope.
  const MAX_TOOL_CONTENT_CHARS = 48000;

  function capToolContent(text) {
    if (text.length <= MAX_TOOL_CONTENT_CHARS) return text;
    return (
      text.slice(0, MAX_TOOL_CONTENT_CHARS) +
      '\n[…tool result truncated — work with what is shown or narrow the query…]'
    );
  }

  // Lone surrogates (possible in sandboxed output) would produce an invalid
  // UTF-8 request body downstream; normalize before it leaves.
  function toWellFormedText(text) {
    if (typeof text.toWellFormed === "function") return text.toWellFormed();
    return new TextDecoder().decode(new TextEncoder().encode(text));
  }

  if (allowedNames && !allowedNames.has(name)) {
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name,
      content: JSON.stringify({
        error: `Tool '${name}' is not available in this session.`,
      }),
    };
  }

  let args = {};

  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch (err) {
    const raw = String(toolCall.function.arguments || "");
    // Large tool calls can exceed the model's per-turn output budget,
    // truncating the argument JSON mid-string. Give an actionable hint.
    const looksTruncated = raw.length > 2000 && !raw.trimEnd().endsWith("}");
    const hint = looksTruncated
      ? " The arguments look TRUNCATED — the file content exceeded this turn's output limit. Build the file in pieces instead: write_file the first section, then extend it with append_file."
      : "";
    console.error("Failed to parse tool arguments:", err);
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name,
      content: JSON.stringify({
        error: `Invalid JSON in tool arguments: ${err.message}.${hint}`,
      }),
    };
  }

  const tool = toolManager.getTool(name);
  if (!tool) {
    console.warn(`Tool not found: ${name}`);
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name,
      content: JSON.stringify({ error: `Unknown tool '${name}'` }),
    };
  }

  try {
    const result = await tool.executor(args, messageHistory);
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name,
      content: capToolContent(toWellFormedText(JSON.stringify(result ?? null))),
    };
  } catch (err) {
    console.error(`Error executing tool "${name}"`, err);
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      name,
      content: JSON.stringify({
        error: `Tool execution failed: ${err.message || String(err)}`,
      }),
    };
  }
}

// Re-export for backward compatibility
export { formatMessageForAPI };

/**
 * Memoized formatting for conversation history. Loaded messages are stable
 * objects that persist across sends, so their formatted API shape is cached
 * per object (both reasoning variants) instead of being rebuilt — including
 * large tool results — on every send. Streaming messages are replaced with
 * fresh objects on each update, so they naturally recompute.
 */
const formattedMessageCache = new WeakMap();

function formatMessageForAPICached(msg, includeReasoning) {
  let entry = formattedMessageCache.get(msg);
  if (!entry) {
    entry = { plain: null, lastAssistant: null };
    formattedMessageCache.set(msg, entry);
  }
  const slot = includeReasoning ? "lastAssistant" : "plain";
  if (!entry[slot]) {
    entry[slot] = formatMessageForAPI(msg, { includeReasoning });
  }
  return entry[slot];
}
