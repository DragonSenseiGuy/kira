/**
 * @file messageFormat.js
 * @description Turns stored messages into the shape the chat completions API
 * expects: multimodal user content, and assistant turns flattened into the
 * interleaved assistant/tool sequence the model replays as its own history.
 *
 * Split out of message.js, which had grown past a thousand lines. This half
 * is pure: no fetch, no streaming, no app state.
 */

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
export function formatMessageForAPI(msg, options = {}) {
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
