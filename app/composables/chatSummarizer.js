/**
 * @file chatSummarizer.js
 * @description Summarizes chat conversations for Notebook integration.
 * 
 * Creates concise, narrative summaries of conversations from the user's perspective,
 * focusing on facts and state changes about the user rather than assistant explanations.
 */

import localforage from "localforage";
import { getSessionToken } from "~/composables/useSession";

const CHAT_SUMMARY_KEY_PREFIX = "chat_summary_";

/**
 * Loads summary metadata for a conversation
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object|null>} Summary metadata or null
 */
export async function loadChatSummary(conversationId) {
  try {
    return await localforage.getItem(`${CHAT_SUMMARY_KEY_PREFIX}${conversationId}`);
  } catch (error) {
    console.error(`Error loading chat summary for ${conversationId}:`, error);
    return null;
  }
}

/**
 * Saves summary metadata for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {Object} summary - Summary data
 * @returns {Promise<boolean>} Success status
 */
export async function saveChatSummary(conversationId, summary) {
  try {
    await localforage.setItem(`${CHAT_SUMMARY_KEY_PREFIX}${conversationId}`, {
      ...summary,
      conversationId
    });
    return true;
  } catch (error) {
    console.error(`Error saving chat summary for ${conversationId}:`, error);
    return false;
  }
}

/**
 * Gets all chats that need summarization
 * @returns {Promise<Array>} Array of conversations needing summary
 */
export async function getChatsNeedingSummary() {
  try {
    const metadata = (await localforage.getItem("conversations_metadata")) || [];
    const chatsNeedingSummary = [];

    for (const conv of metadata) {
      const summary = await loadChatSummary(conv.id);
      
      // Skip if no messages
      const convData = await localforage.getItem(`conversation_${conv.id}`);
      if (!convData?.messages || convData.messages.length === 0) {
        continue;
      }

      // Needs summary if:
      // 1. No summary exists, OR
      // 2. There are new messages since last summary
      if (!summary) {
        chatsNeedingSummary.push({
          ...conv,
          messages: convData.messages,
          hasExistingSummary: false
        });
      } else {
        const lastSummarizedMsg = convData.messages.find(
          m => m.id === summary.lastMessageId
        );
        const lastMessage = convData.messages[convData.messages.length - 1];
        
        if (lastMessage && lastSummarizedMsg && lastMessage.id !== lastSummarizedMsg.id) {
          const newMessages = convData.messages.slice(
            convData.messages.findIndex(m => m.id === summary.lastMessageId) + 1
          );
          
          chatsNeedingSummary.push({
            ...conv,
            messages: convData.messages,
            newMessages,
            existingSummary: summary.summary,
            hasExistingSummary: true
          });
        }
      }
    }

    return chatsNeedingSummary;
  } catch (error) {
    console.error("Error getting chats needing summary:", error);
    return [];
  }
}

/**
 * Summarizes a full conversation from scratch
 * Uses a cheap, fast model for cost efficiency
 * 
 * @param {Array} messages - Array of conversation messages
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<string|null>} Summary text or null on error
 */
export async function summarizeChat(messages, apiKey) {
  try {
    // Filter to relevant messages (skip system messages, focus on user/assistant exchange)
    const relevantMessages = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role,
        content: m.content?.substring(0, 2000) || "" // Limit content length
      }))
      .slice(-50); // Only consider last 50 messages

    if (relevantMessages.length === 0) {
      return null;
    }

    const sessionToken = await getSessionToken();
    
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({
        model: "z-ai/glm-4.7-flash", // Cheap, fast model
        messages: [
          {
            role: "system",
            content: `You are creating notes about a user based on their conversation with an AI assistant.

Your task: Write a brief summary (2-6 sentences) of what this conversation reveals about the user.

Guidelines:
- Write in third person from the AI's perspective observing the user
- Focus on facts about the user: their goals, questions, interests, preferences, work, challenges
- Ignore the AI's explanations unless the user actively engaged with them
- Note any projects mentioned, technical choices, or decisions made
- If the conversation is trivial (greeting, small talk, weather), return exactly: NOTHING_NOTABLE
- Be specific but concise - concrete details over generalizations`
          },
          {
            role: "user",
            content: `Here is the conversation to summarize:\n\n${formatMessagesForSummary(relevantMessages)}`
          }
        ],
        stream: false,
        ...(apiKey && { customApiKey: apiKey })
      })
    });

    if (!response.ok) {
      throw new Error(`Summary request failed: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (summary === "NOTHING_NOTABLE") {
      return null;
    }

    return summary;
  } catch (error) {
    console.error("Error summarizing chat:", error);
    return null;
  }
}

/**
 * Incrementally updates an existing summary with new messages
 * 
 * @param {string} existingSummary - Previous summary
 * @param {Array} newMessages - New messages since last summary
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<string|null>} Updated summary or null on error
 */
export async function incrementalSummarize(existingSummary, newMessages, apiKey) {
  try {
    const relevantMessages = newMessages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role,
        content: m.content?.substring(0, 2000) || ""
      }));

    if (relevantMessages.length === 0) {
      return existingSummary;
    }

    const sessionToken = await getSessionToken();
    
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-token": sessionToken,
      },
      body: JSON.stringify({
        model: "z-ai/glm-4.7-flash",
        messages: [
          {
            role: "system",
            content: `You are updating notes about a user based on new conversation activity.

You have:
1. An existing summary of previous conversations
2. New messages from the user

Your task: Produce an updated summary that integrates the new information.

Guidelines:
- Preserve important details from the existing summary
- Add new facts, projects, or insights from the recent messages
- Remove or update outdated information if contradicted
- Keep the length reasonable (2-6 sentences)
- Write in third person from an AI observing the user
- If the new messages add nothing notable, return the existing summary unchanged
- If the existing summary plus new messages reveal nothing notable, return: NOTHING_NOTABLE`
          },
          {
            role: "user",
            content: `Existing summary:\n${existingSummary}\n\nNew messages:\n${formatMessagesForSummary(relevantMessages)}\n\nUpdated summary:`
          }
        ],
        stream: false,
        ...(apiKey && { customApiKey: apiKey })
      })
    });

    if (!response.ok) {
      throw new Error(`Incremental summary request failed: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (summary === "NOTHING_NOTABLE") {
      return null;
    }

    return summary || existingSummary;
  } catch (error) {
    console.error("Error incrementally summarizing:", error);
    return existingSummary; // Return existing on error
  }
}

/**
 * Processes a batch of chats for summarization
 * Runs summaries in parallel with a concurrency limit
 * 
 * @param {Array} chats - Chats needing summary from getChatsNeedingSummary()
 * @param {string} apiKey - OpenRouter API key
 * @param {number} concurrency - Max parallel requests (default 5)
 * @returns {Promise<Array>} Results array
 */
export async function processChatSummaries(chats, apiKey, concurrency = 5) {
  const results = [];
  
  // Process in batches to limit concurrency
  for (let i = 0; i < chats.length; i += concurrency) {
    const batch = chats.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (chat) => {
      try {
        let summary;
        
        if (chat.hasExistingSummary && chat.existingSummary && chat.newMessages) {
          summary = await incrementalSummarize(
            chat.existingSummary,
            chat.newMessages,
            apiKey
          );
        } else {
          summary = await summarizeChat(chat.messages, apiKey);
        }

        if (summary) {
          const lastMessage = chat.messages[chat.messages.length - 1];
          await saveChatSummary(chat.id, {
            summary,
            lastMessageId: lastMessage?.id,
            lastSummarizedAt: new Date().toISOString(),
            messageCount: chat.messages.length
          });
          
          return { chatId: chat.id, success: true, summary };
        } else {
          // Mark as processed even if nothing notable
          const lastMessage = chat.messages[chat.messages.length - 1];
          await saveChatSummary(chat.id, {
            summary: chat.existingSummary || "Nothing notable",
            lastMessageId: lastMessage?.id,
            lastSummarizedAt: new Date().toISOString(),
            nothingNotable: true
          });
          
          return { chatId: chat.id, success: true, nothingNotable: true };
        }
      } catch (error) {
        console.error(`Failed to summarize chat ${chat.id}:`, error);
        return { chatId: chat.id, success: false, error: error.message };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Formats messages for the summarization prompt
 * @param {Array} messages - Message objects
 * @returns {string} Formatted conversation text
 */
function formatMessagesForSummary(messages) {
  return messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
}

/**
 * Deletes the summary for a specific conversation
 * Called when a conversation is deleted
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteChatSummary(conversationId) {
  try {
    await localforage.removeItem(`${CHAT_SUMMARY_KEY_PREFIX}${conversationId}`);
    console.log(`Chat summary for ${conversationId} deleted`);
    return true;
  } catch (error) {
    console.error(`Error deleting chat summary for ${conversationId}:`, error);
    return false;
  }
}

/**
 * Clears all chat summaries (used when resetting the Notebook)
 * This forces all chats to be re-summarized and incorporated into a fresh Notebook
 * @returns {Promise<boolean>} Success status
 */
export async function clearAllSummaries() {
  try {
    const metadata = (await localforage.getItem("conversations_metadata")) || [];
    
    // Remove all summary keys
    for (const conv of metadata) {
      await localforage.removeItem(`${CHAT_SUMMARY_KEY_PREFIX}${conv.id}`);
    }
    
    console.log("All chat summaries cleared");
    return true;
  } catch (error) {
    console.error("Error clearing all summaries:", error);
    return false;
  }
}

/**
 * Gets all summaries that haven't been incorporated into the Notebook yet
 * @returns {Promise<Array>} Array of summaries needing incorporation
 */
export async function getSummariesForNotebook() {
  try {
    const [notebookMetadata, metadata] = await Promise.all([
      localforage.getItem("user_notebook_metadata"),
      localforage.getItem("conversations_metadata")
    ]);

    const lastNotebookUpdate = notebookMetadata?.lastConsolidatedAt;
    const summaries = [];

    for (const conv of metadata || []) {
      const summary = await loadChatSummary(conv.id);
      if (summary && summary.summary && summary.summary !== "Nothing notable") {
        // Include if:
        // 1. No Notebook exists yet, OR
        // 2. Summary is newer than last Notebook update
        if (!lastNotebookUpdate || 
            new Date(summary.lastSummarizedAt) > new Date(lastNotebookUpdate)) {
          summaries.push({
            conversationId: conv.id,
            title: conv.title,
            summary: summary.summary,
            lastSummarizedAt: summary.lastSummarizedAt,
            dateRange: {
              start: conv.lastUpdated, // Approximation
              end: summary.lastSummarizedAt
            }
          });
        }
      }
    }

    return summaries;
  } catch (error) {
    console.error("Error getting summaries for Notebook:", error);
    return [];
  }
}