import localforage from "localforage";
import { emitter } from "~/composables/emitter";
import { migrateMessages } from "./branchManager";
import { requestCompletion, extractCompletionText } from "~/composables/apiClient";
import { getBackgroundTarget } from "~/composables/backgroundCredentials";
import { deleteChatSummary } from "./chatSummarizer";
import { deleteContextSummary } from "./contextCompressor";
import { useCloudSync } from "~/composables/useCloudSync";

/**
 * Serializes a message object for storage, removing Vue reactivity proxies
 * and ensuring all data is JSON-serializable.
 * @param {Object} msg - The message object to serialize
 * @returns {Object} Serialized message ready for storage
 */
function serializeMessage(msg) {
  const baseMessage = {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    complete: msg.complete,
    // Branching metadata
    parentId: msg.parentId ?? null,
    branchIndex: msg.branchIndex ?? 0,
  };

  // Add attachments for user messages (deep clone to remove reactive proxies)
  if (msg.role === "user" && msg.attachments && msg.attachments.length > 0) {
    baseMessage.attachments = JSON.parse(JSON.stringify(msg.attachments));
  }

  // Add reasoning properties for assistant messages
  if (msg.role === "assistant") {
    baseMessage.reasoning = msg.reasoning;
    baseMessage.reasoningStartTime = msg.reasoningStartTime;
    baseMessage.reasoningEndTime = msg.reasoningEndTime;
    baseMessage.reasoningDuration = msg.reasoningDuration;
    baseMessage.tool_calls = msg.tool_calls
      ? JSON.parse(JSON.stringify(msg.tool_calls))
      : [];
    baseMessage.apiCallTime = msg.apiCallTime;
    baseMessage.firstTokenTime = msg.firstTokenTime;
    baseMessage.completionTime = msg.completionTime;
    baseMessage.tokenCount = msg.tokenCount;
    baseMessage.totalTokens = msg.totalTokens;
    baseMessage.promptTokens = msg.promptTokens;
    baseMessage.annotations = msg.annotations
      ? JSON.parse(JSON.stringify(msg.annotations))
      : null;
    baseMessage.parts = msg.parts
      ? JSON.parse(JSON.stringify(msg.parts))
      : null;
  }

  // Add tool message properties
  if (msg.role === "tool") {
    baseMessage.tool_call_id = msg.tool_call_id;
    baseMessage.name = msg.name;
  }

  return baseMessage;
}

export async function createConversation(plainMessages, lastUpdated) {
  const conversationId = crypto.randomUUID();
  const rawMessages = plainMessages.map(serializeMessage);
  const title = "Untitled";

  try {
    await localforage.setItem(`conversation_${conversationId}`, {
      title,
      lastUpdated,
      messages: rawMessages,
      branchPath: [],
    });

    const metadata =
      (await localforage.getItem("conversations_metadata")) || [];
    metadata.push({ id: conversationId, title, lastUpdated, createdAt: lastUpdated });
    await localforage.setItem("conversations_metadata", metadata);

    emitter.emit("updateConversations");

    // Mirror to the signed-in account in the background; a no-op when
    // running local-only.
    useCloudSync().cloudCreateConversation(conversationId, {
      title,
      messages: rawMessages,
      branchPath: [],
    });

    generateTitleInBackground(conversationId, plainMessages, lastUpdated);

    return conversationId;
  } catch (error) {
    console.error("Error creating conversation:", error);
    // Propagate so callers can surface the failure instead of silently
    // continuing with an unusable conversation id.
    throw error;
  }
}

/** Model ID used for title generation when the active provider is Hack Club AI. */
const TITLE_GENERATION_MODEL = "z-ai/glm-5.3-flash";

async function generateTitleInBackground(conversationId, plainMessages, lastUpdated) {
  const systemPrompt = `You are an AI with the task of shortening and summarising messages into a short title. You must summarise the given messages based on their content into at most a 40 character title. Each conversation is between a user and an AI chatbot. The messages provided to you are the first messages of the conversation. The title must be general enough to apply to what you think the conversation will be about. Only output the title, without any additional explainations or commentary.`;

  try {
    const target = await getBackgroundTarget();
    if (!target.model || !target.customApiKey) {
      console.warn("No usable model/key for title generation, skipping");
      return;
    }

    // When using the Hack Club AI provider, always use the dedicated
    // title-generation model rather than the user's currently selected model.
    // Custom providers use whatever model the user has chosen.
    if (!target.upstreamBaseUrl) {
      target.model = TITLE_GENERATION_MODEL;
    }

    const data = await requestCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        ...plainMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      ],
      model: target.model,
      customApiKey: target.customApiKey,
      ...(target.upstreamBaseUrl ? { upstreamBaseUrl: target.upstreamBaseUrl } : {}),
    });

    let newTitle = "Untitled"; // Default to Untitled if API call fails
    if (data.choices) {
      newTitle = extractCompletionText(data) || "Untitled";
      // Truncate title to 40 characters if needed
      if (newTitle.length > 40) {
        newTitle = newTitle.substring(0, 40);
      }
    } else {
      console.error("Unexpected response format for title generation:", data);
    }

    // Update the conversation with the new title
    const conversation = await localforage.getItem(`conversation_${conversationId}`);
    if (conversation) {
      conversation.title = newTitle;
      conversation.lastUpdated = lastUpdated;
      await localforage.setItem(`conversation_${conversationId}`, conversation);

      // Update metadata as well
      const metadata = (await localforage.getItem("conversations_metadata")) || [];
      const updatedMetadata = metadata.map(conv =>
        conv.id === conversationId ? { ...conv, title: newTitle, lastUpdated } : conv
      );
      await localforage.setItem("conversations_metadata", updatedMetadata);

      emitter.emit("updateConversations");
      emitter.emit("conversationTitleUpdated", { conversationId, title: newTitle });

      useCloudSync().syncConversation(conversationId, conversation);
    }
  } catch (error) {
    console.error("Error generating title in background:", error);
    // Keep the "Untitled" title if API call fails
  }
}

export async function storeMessages(
  conversationId,
  plainMessages,
  lastUpdated
) {
  const data = await localforage.getItem(`conversation_${conversationId}`);
  if (!data) {
    console.warn(`No conversation found for id ${conversationId}.`);
    return;
  }

  const rawMessages = plainMessages.map(serializeMessage);
  const title = data.title || "Untitled";
  const branchPath = data.branchPath ?? [];

  await localforage.setItem(`conversation_${conversationId}`, {
    title,
    lastUpdated,
    messages: rawMessages,
    branchPath,
  });

  const metadata = (await localforage.getItem("conversations_metadata")) || [];
  const updatedMetadata = metadata.filter((m) => m.id !== conversationId);
  updatedMetadata.push({ id: conversationId, title, lastUpdated });
  await localforage.setItem("conversations_metadata", updatedMetadata);

  useCloudSync().syncConversation(conversationId, {
    title,
    messages: rawMessages,
    branchPath,
  });

}

export async function deleteConversation(conversationId) {
  // Remove full conversation data
  await localforage.removeItem(`conversation_${conversationId}`);

  // Delete the chat summary for this conversation
  await deleteChatSummary(conversationId);

  // Delete the context-compression sidecar for this conversation
  await deleteContextSummary(conversationId);

  // Update metadata by filtering out the deleted conversation.
  const metadata = (await localforage.getItem("conversations_metadata")) || [];
  const updatedMetadata = metadata.filter((m) => m.id !== conversationId);
  await localforage.setItem("conversations_metadata", updatedMetadata);

  // Best effort: the local delete above is authoritative here, so the
  // boolean result is deliberately ignored (the call never rejects).
  void useCloudSync().cloudDeleteConversation(conversationId);

  // Emit an event so that the sidebar updates its list.
  emitter.emit("updateConversations");

  // Emit an event with the deleted conversation ID so pages can react
  emitter.emit("conversationDeleted", { conversationId });
}

/**
 * Updates the branch path for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {Array<number>} branchPath - The new branch path
 */
export async function updateBranchPath(conversationId, branchPath) {
  const data = await localforage.getItem(`conversation_${conversationId}`);
  if (!data) {
    console.warn(`No conversation found for id ${conversationId}.`);
    return;
  }

  const updated = { ...data, branchPath, lastUpdated: new Date() };
  await localforage.setItem(`conversation_${conversationId}`, updated);

  useCloudSync().syncConversation(conversationId, updated);
}

/**
 * Loads a conversation and migrates messages if needed for branching support
 * @param {string} conversationId - The conversation ID
 * @returns {Object|null} The conversation data with migrated messages, or null if not found
 */
/**
 * Removes legacy `context_summary` marker messages left behind by the
 * old in-chat compression implementation. Those markers lost their
 * summary fields on persist (serializeMessage never kept them), so
 * they are unrecoverable husks. Any message orphaned by the removal
 * is re-parented to the marker's parent.
 *
 * @param {Array} messages
 * @returns {{messages: Array, stripped: boolean}}
 */
function stripLegacySummaryMarkers(messages) {
  if (!Array.isArray(messages)) return { messages, stripped: false };

  const huskParentById = new Map();
  for (const msg of messages) {
    if (msg && msg.role === "context_summary") {
      huskParentById.set(msg.id, msg.parentId ?? null);
    }
  }
  if (huskParentById.size === 0) return { messages, stripped: false };

  const cleaned = messages
    .filter((msg) => msg && !huskParentById.has(msg.id))
    .map((msg) =>
      huskParentById.has(msg.parentId)
        ? { ...msg, parentId: huskParentById.get(msg.parentId) }
        : msg,
    );
  return { messages: cleaned, stripped: true };
}

export async function loadConversation(conversationId) {
  const data = await localforage.getItem(`conversation_${conversationId}`);
  if (!data) return null;

  // Strip legacy context_summary husks left by the old compressor.
  const { messages: strippedMessages, stripped } = stripLegacySummaryMarkers(
    data.messages,
  );

  // Migrate messages if they don't have branching metadata
  const needsMigration = strippedMessages?.length > 0 &&
    strippedMessages[0].parentId === undefined;

  if (needsMigration) {
    const migratedMessages = migrateMessages(strippedMessages);
    // Save the migrated data
    await localforage.setItem(`conversation_${conversationId}`, {
      ...data,
      messages: migratedMessages,
      branchPath: data.branchPath ?? [],
    });
    return {
      ...data,
      messages: migratedMessages,
      branchPath: data.branchPath ?? [],
    };
  }

  if (stripped) {
    await localforage.setItem(`conversation_${conversationId}`, {
      ...data,
      messages: strippedMessages,
    });
  }

  return {
    ...data,
    messages: strippedMessages,
    branchPath: data.branchPath ?? [],
  };
}
