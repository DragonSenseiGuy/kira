import { ref, computed, nextTick, onMounted, onUnmounted, toRaw } from 'vue';
import { useRouter } from 'vue-router';
import localforage from 'localforage';
import { createConversation as createNewConversation, storeMessages, deleteConversation as deleteConv, updateBranchPath, loadConversation } from './storeConversations';
import { handleIncomingMessage } from './message';
import { normalizeReasoningConfig, getDefaultReasoningEffort } from './availableModels';
import DEFAULT_PARAMETERS from './defaultParameters';
import { useSettings } from './useSettings';
import { useGlobalIncognito } from './useGlobalIncognito';
import { emitter } from './emitter';
import { resolveChatTarget } from './providers';
import {
  setActiveConversation,
  getActiveConversation,
  deleteChatWorkspace,
} from './workspaceSession';
import { PartsBuilder, TimingTracker } from './partsBuilder';
import { buildApiHistory } from './contextCompressor';
import {
  maybeAutoCompress,
  refreshCompressionState,
  getCachedValidSummaries,
  loadCompressionState,
  clearCompressionState,
} from './contextCompressionPipeline';
import {
  getMessagesForBranchPath,
  createBranch,
  switchBranch,
  buildSiblingInfoMap,
  calculateBranchPath
} from './branchManager';

/**
 * Creates a centralized message manager for handling all chat message operations
 * Uses the shared settings instance for consistency across the app
 * @param {Object} chatPanel - Reference to the ChatPanel component
 * @returns {Object} Messages manager with reactive state and methods
 */
export function useMessagesManager(chatPanel) {
  // Use the shared settings instance
  const settingsManager = useSettings();

  // Use global incognito state
  const { isIncognito, toggleIncognito: globalToggleIncognito } = useGlobalIncognito();

  // Initialize router for navigation
  const router = useRouter();

  // Reactive state for messages
  const messages = ref([]);
  const branchPath = ref([]);
  const isLoading = ref(false);
  const controller = ref(new AbortController());
  const currConvo = ref('');
  const conversationTitle = ref('');
  const isTyping = ref(false);
  const chatLoading = ref(false);

  // Computed properties
  const visibleMessages = computed(() => {
    if (isIncognito.value) return messages.value;
    return getMessagesForBranchPath(messages.value, branchPath.value);
  });

  const branchInfo = computed(() => {
    return buildSiblingInfoMap(messages.value, visibleMessages.value);
  });

  const hasMessages = computed(() => visibleMessages.value.length > 0);
  const isEmptyConversation = computed(() => !currConvo.value && messages.value.length === 0);

  // Set up event listener for title updates
  const handleTitleUpdate = ({ conversationId, title }) => {
    if (currConvo.value === conversationId) {
      conversationTitle.value = title;
    }
  };

  // Handle conversation deletion
  const handleConversationDeleted = ({ conversationId }) => {
    clearCompressionState(conversationId);
    deleteChatWorkspace(conversationId); // privacy-first: files die with the chat
    if (currConvo.value === conversationId && !isIncognito.value) {
      currConvo.value = '';
      messages.value = [];
      conversationTitle.value = '';
      branchPath.value = [];
      router.push('/');
    }
  };

  onMounted(() => {
    emitter.on('conversationTitleUpdated', handleTitleUpdate);
    emitter.on('conversationDeleted', handleConversationDeleted);
  });

  onUnmounted(() => {
    emitter.off('conversationTitleUpdated', handleTitleUpdate);
    emitter.off('conversationDeleted', handleConversationDeleted);
  });

  // Method to update chat panel reference
  function setChatPanel(newChatPanel) {
    chatPanel.value = newChatPanel;
  }

  /**
   * Generates a unique ID for messages
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
  }

  /**
   * Adds a user message to the messages array
   */
  function addUserMessage(content, attachments = []) {
    if (!content.trim() && attachments.length === 0) return;

    const parentId = visibleMessages.value.length > 0
      ? visibleMessages.value[visibleMessages.value.length - 1].id
      : null;

    const userMessage = {
      id: generateId(),
      role: "user",
      content: content,
      attachments: attachments.map(a => ({
        id: a.id,
        type: a.type,
        filename: a.filename,
        dataUrl: a.dataUrl,
        mimeType: a.mimeType
      })),
      timestamp: new Date(),
      complete: true,
      parentId: parentId,
      branchIndex: 0
    };

    messages.value.push(userMessage);

    if (!isIncognito.value) {
      branchPath.value = calculateBranchPath(messages.value, userMessage.id);
    }
  }

  /**
   * Creates a new assistant message and adds it to the messages array
   */
  function createAssistantMessage() {
    const parentId = visibleMessages.value.length > 0
      ? visibleMessages.value[visibleMessages.value.length - 1].id
      : null;

    const assistantMsg = {
      id: generateId(),
      role: "assistant",
      reasoning: "",
      content: "",
      tool_calls: [],
      parts: [], // Structured parts: reasoning, content, tool_group, image
      timestamp: new Date(),
      complete: false,
      parentId: parentId,
      branchIndex: 0,
      apiCallTime: new Date(),
      firstTokenTime: null,
      completionTime: null,
      tokenCount: 0,
      totalTokens: 0,
      promptTokens: 0,
      reasoningStartTime: null,
      reasoningEndTime: null,
      reasoningDuration: null,
      error: false,
      errorDetails: null,
      annotations: null
    };

    messages.value.push(assistantMsg);
    return assistantMsg;
  }

  /**
   * Updates an assistant message with new content.
   * The splice gives the array a new identity so shallow watchers and
   * computed props re-evaluate without deep-traversing every message.
   */
  function updateAssistantMessage(message, updates) {
    const index = messages.value.findIndex(m => m.id === message.id);
    if (index !== -1) {
      Object.assign(message, updates);
      messages.value.splice(index, 1, { ...message });
    }
  }

  /**
   * Fire-and-forget auto compression trigger. Runs after the user sends a
   * message and again after the assistant finishes, so the context is kept
   * compact regardless of which side of the turn pushed it over the threshold.
   */
  function triggerAutoCompression() {
    if (isIncognito.value || !currConvo.value) return;

    const convoId = currConvo.value;
    const settingsSnapshot = settingsManager.settings;
    refreshCompressionState(convoId, visibleMessages.value, settingsSnapshot);
    maybeAutoCompress({
      conversationId: convoId,
      getVisibleMessages: () => visibleMessages.value,
      settings: settingsSnapshot,
      apiKey: settingsSnapshot.custom_api_key,
      branchPath: branchPath.value.slice(),
      isIncognito: isIncognito.value,
    }).catch((error) => {
      console.error("[messagesManager] auto compression failed:", error);
    });
  }

  /**
   * Sends a message to the AI and handles the response
   */
  async function sendMessage(message, originalMessage = null, attachments = [], searchEnabled = false, options = {}) {
    const { skipUserMessage = false, parentId: explicitParentId = null } = options;

    if ((!message.trim() && attachments.length === 0) || isLoading.value) return;

    // Check credentials. Only relayed traffic needs an API key — loopback
    // runtimes (Ollama/LM Studio) are called directly from the browser and
    // work without one, so a local-only setup must not be blocked here.
    const chatTarget = resolveChatTarget(settingsManager.settings);
    if (!chatTarget.direct && !chatTarget.apiKey) {
      const tempAssistantMsg = createAssistantMessage();
      updateAssistantMessage(tempAssistantMsg, {
        content: `⚠️ **API Key Required**\n\nPlease add your own API key in Settings → General to use models.`,
        complete: true,
        error: true,
        errorDetails: { name: 'APIKeyRequired', message: 'API key is required to use models' }
      });
      return;
    }

    controller.value = new AbortController();
    isLoading.value = true;
    // Scope the file workspace to this conversation (null while incognito).
    setActiveConversation(isIncognito.value ? null : currConvo.value || null);
    isTyping.value = false;

    const messageToStore = originalMessage !== null ? originalMessage : message;
    if (!skipUserMessage) {
      addUserMessage(messageToStore, attachments);
    }

    const assistantMsg = createAssistantMessage();
    if (explicitParentId) {
      assistantMsg.parentId = explicitParentId;
    }

    // Create conversation if needed. Storage failures are surfaced to
    // the user instead of silently continuing with a broken state.
    if (!currConvo.value && !isIncognito.value) {
      try {
        currConvo.value = await createNewConversation(messages.value, new Date());
      } catch (error) {
        console.error('[messagesManager] Failed to create conversation:', error);
        updateAssistantMessage(assistantMsg, {
          content: '⚠️ **Could not save this conversation**\n\nYour message could not be stored locally. Please check available storage space and try again.',
          complete: true,
          error: true,
          errorDetails: { name: 'StorageError', message: 'Failed to create conversation' }
        });
        isLoading.value = false;
        return;
      }
      if (currConvo.value) {
        const convData = await loadConversation(currConvo.value);
        conversationTitle.value = convData?.title || "";
        setActiveConversation(currConvo.value); // brand-new chat now has a workspace
      }
    }

    // Fire-and-forget: auto-compress after the user message is added, in
    // case the user turn itself pushed the context over the threshold.
    triggerAutoCompression();

    await nextTick();
    requestAnimationFrame(() => {
      chatPanel?.value?.scrollToEnd("smooth");
    });

    // Get current model details (resolves both catalog and
    // custom-provider models)
    const selectedModelDetails = settingsManager.selectedModel;

    if (!selectedModelDetails) {
      console.error("No model selected or model details not found. Aborting message send.");
      updateAssistantMessage(assistantMsg, {
        content: (assistantMsg.content ? assistantMsg.content + "\n\n" : "") + "Error: No AI model selected.",
        complete: true
      });
      isLoading.value = false;
      return;
    }

    // Construct model parameters
    const reasoningConfig = normalizeReasoningConfig(selectedModelDetails);
    const savedReasoningEffort = settingsManager.getModelSetting(selectedModelDetails.id, "reasoning_effort") ||
      getDefaultReasoningEffort(selectedModelDetails);

    const parameterConfig = settingsManager.settings.parameter_config || { ...DEFAULT_PARAMETERS };

    const model_parameters = {
      ...parameterConfig,
      ...selectedModelDetails.extra_parameters,
      reasoning: {
        effort: savedReasoningEffort,
        enabled: reasoningConfig.toggleable ? savedReasoningEffort !== 'none' : true
      }
    };

    // Initialize parts builder and timing tracker
    const partsBuilder = new PartsBuilder();
    const timing = new TimingTracker(assistantMsg);

    // Track tool calls and their results
    let currentToolCalls = [];
    let hasExecutedTools = false;

    try {
      // Build conversation history for the API
      // Tool results are now stored in assistant message parts, not as separate messages
      const rawHistory = visibleMessages.value.filter(msg => {
        if (!msg.complete) return false;
        if (msg.role === 'tool') return false; // Skip tool messages - they're in assistant parts
        if (msg.role === 'user') {
          const lastUserMsg = [...visibleMessages.value].reverse().find(m => m.role === 'user');
          if (lastUserMsg && msg.id === lastUserMsg.id) return false;
        }
        return true;
      });

      // Apply context compression: swap spans covered by valid sidecar
      // summaries for labeled summary messages. Skipped in incognito
      // mode (where nothing is persisted or compressed).
      const historyForAPI = isIncognito.value
        ? rawHistory
        : buildApiHistory(rawHistory, getCachedValidSummaries(currConvo.value));

      const streamGenerator = handleIncomingMessage(
        message,
        historyForAPI,
        controller.value,
        settingsManager.settings.selected_model_id,
        model_parameters,
        settingsManager.settings,
        selectedModelDetails.extra_functions || [],
        searchEnabled,
        isIncognito.value,
        attachments
      );

      // RAF batching for UI updates
      let rafScheduled = false;
      const scheduleUIUpdate = () => {
        if (!rafScheduled) {
          rafScheduled = true;
          requestAnimationFrame(() => {
            syncAssistantMessage(assistantMsg, partsBuilder);
            if (chatPanel?.value?.isAtBottom) {
              chatPanel.value.scrollToEnd("smooth");
            }
            rafScheduled = false;
          });
        }
      };

      for await (const chunk of streamGenerator) {
        // Process content - skip if this is the final complete chunk (content already accumulated)
        if (chunk.content && !chunk.complete) {
          partsBuilder.appendContent(chunk.content);
          assistantMsg.content = (assistantMsg.content || '') + chunk.content;
          timing.markFirstToken();
          timing.endReasoning();
        }

        // Process images
        if (chunk.images && chunk.images.length > 0) {
          for (const image of chunk.images) {
            partsBuilder.processImage(image);
          }
        }

        // Process reasoning - skip if this is the final complete chunk (reasoning already accumulated)
        if (chunk.reasoning && chunk.reasoning.trim() !== 'None' && !chunk.complete) {
          partsBuilder.appendReasoning(chunk.reasoning);
          if (assistantMsg.reasoning.trim() === '' && chunk.reasoning.trim() !== '') {
            assistantMsg.reasoning = chunk.reasoning;
          } else {
            assistantMsg.reasoning += chunk.reasoning;
          }
          timing.markFirstToken();
          timing.startReasoning();
        }

        // Process tool calls
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
          // Tool calls separate reasoning segments the same way they separate content segments.
          // Close out the current reasoning part in the parts builder (defensive - addOrUpdateTool
          // also finalizes reasoning internally) and reset the flat-string accumulator so the
          // next reasoning chunk starts a fresh segment.
          partsBuilder.finalizeReasoning();
          assistantMsg.reasoning = '';

          for (const tool of chunk.tool_calls) {
            const toolType = tool.type || 'function';
            partsBuilder.addOrUpdateTool(toolType, tool);

            // Track tool calls
            if (tool.id && !currentToolCalls.find(tc => tc.id === tool.id)) {
              currentToolCalls.push({
                id: tool.id,
                type: toolType,
                function: {
                  name: tool.function?.name || '',
                  arguments: tool.function?.arguments || ''
                }
              });
            }
          }
        }

        // Process tool results
        if (chunk.tool_result) {
          partsBuilder.setToolResult(chunk.tool_result.id, chunk.tool_result.result);
          hasExecutedTools = true;
          
          // Update currentToolCalls with results
          const toolCall = currentToolCalls.find(tc => tc.id === chunk.tool_result.id);
          if (toolCall) {
            toolCall.result = chunk.tool_result.result;
          }
        }

        // Tool results are now stored in the assistant message's parts via partsBuilder
        // No separate tool messages needed - this keeps branching simple (1 message per turn)

        // Process usage
        if (chunk.usage) {
          if (chunk.usage.completion_tokens !== undefined) {
            assistantMsg.tokenCount = chunk.usage.completion_tokens;
          }
          if (chunk.usage.total_tokens !== undefined) {
            assistantMsg.totalTokens = chunk.usage.total_tokens;
          }
          if (chunk.usage.prompt_tokens !== undefined) {
            assistantMsg.promptTokens = chunk.usage.prompt_tokens;
          }
        }

        // Process annotations
        if (chunk.annotations) {
          assistantMsg.annotations = chunk.annotations;
        }

        // Process cancellation. The generator reports user-initiated stops
        // as a dedicated event; this is the single site where the marker
        // text enters content (mirrors the error-suffix contract).
        if (chunk.canceled) {
          const stopSuffix = '\n\n_[generation stopped]_';
          partsBuilder.appendContent(stopSuffix);
          assistantMsg.content = (assistantMsg.content || '') + stopSuffix;
        }

        // Process errors. The generator guarantees at most ONE error
        // event per turn; keep the first and ignore any stragglers so
        // error details can never stack.
        if (chunk.error && chunk.errorDetails && !assistantMsg.error) {
          assistantMsg.error = true;
          assistantMsg.errorDetails = chunk.errorDetails;
        }

        // Schedule UI update
        scheduleUIUpdate();
      }

      // Final sync
      syncAssistantMessage(assistantMsg, partsBuilder, true);

    } catch (error) {
      console.error('Error in stream processing:', error);
      assistantMsg.error = true;
      assistantMsg.errorDetails = {
        name: error.name || 'Error',
        message: error.message || 'An unexpected error occurred'
      };
    } finally {
      // Ensure parts are stored from partsBuilder
      syncAssistantMessage(assistantMsg, partsBuilder, true);

      // Discard empty reasoning
      if (assistantMsg.reasoning?.trim() === '') {
        assistantMsg.reasoning = '';
      }

      // Mark message as complete
      const finalUpdates = {
        complete: true,
        completionTime: new Date(),
        reasoningDuration: timing.calculateReasoningDuration(),
        tool_calls: currentToolCalls
      };

      Object.assign(assistantMsg, finalUpdates);
      updateAssistantMessage(assistantMsg, finalUpdates);

      // Handle error display. This is the SINGLE place where error text
      // is written into message content — the streaming generator never
      // embeds error strings in content chunks, so the error block can
      // only ever appear once per assistant message.
      if (assistantMsg.error && assistantMsg.errorDetails) {
        const errorSuffix = `\n\n---\n⚠️ **Error:** ${assistantMsg.errorDetails.message}` +
          (assistantMsg.errorDetails.status ? ` (HTTP ${assistantMsg.errorDetails.status})` : '');
        
        partsBuilder.appendContent(errorSuffix);
        
        const errorUpdates = {
          content: (assistantMsg.content || '') + errorSuffix,
          parts: partsBuilder.getPartsSnapshot(),
          error: true,
          errorDetails: assistantMsg.errorDetails
        };

        Object.assign(assistantMsg, errorUpdates);
        updateAssistantMessage(assistantMsg, errorUpdates);
      }

      isLoading.value = false;

      // Store messages if not in incognito mode
      if (!isIncognito.value) {
        await storeMessages(currConvo.value, toRaw(messages.value), new Date());
      }

      // Fire-and-forget: auto-compress after the assistant turn completes,
      // in case the assistant response pushed the context over the threshold.
      triggerAutoCompression();
    }
  }

  /**
   * Sync assistant message with parts builder state.
   *
   * Uses a shallow snapshot: PartsBuilder only ever REPLACES part objects
   * (never mutates them), so a shallow copy is always consistent while
   * avoiding a full deep-clone of the — potentially very long — parts
   * tree on every animation frame during streaming.
   */
  function syncAssistantMessage(message, partsBuilder, finalize = false) {
    if (finalize) {
      partsBuilder.finalizeContent();
      partsBuilder.finalizeReasoning();
    }
    
    const newParts = partsBuilder.getPartsSnapshot();
    const newTools = partsBuilder.getAllTools();
    
    message.parts = newParts;
    message.tool_calls = newTools;
    
    // Update the message in the array
    const index = messages.value.findIndex(m => m.id === message.id);
    if (index !== -1) {
      messages.value.splice(index, 1, { ...message });
    }
  }

  /**
   * Changes the current conversation
   */
  async function changeConversation(id) {
    if (isIncognito.value) return;

    chatLoading.value = true;
    messages.value = [];
    branchPath.value = [];
    currConvo.value = id;

    const conv = await loadConversation(id);
    if (conv?.messages) {
      messages.value = conv.messages.map(msg => {
        if (msg.role === 'assistant') {
          return {
            ...msg,
            apiCallTime: msg.apiCallTime ? new Date(msg.apiCallTime) : null,
            firstTokenTime: msg.firstTokenTime ? new Date(msg.firstTokenTime) : null,
            completionTime: msg.completionTime ? new Date(msg.completionTime) : null,
            reasoningStartTime: msg.reasoningStartTime ? new Date(msg.reasoningStartTime) : null,
            reasoningEndTime: msg.reasoningEndTime ? new Date(msg.reasoningEndTime) : null,
            tool_calls: msg.tool_calls || [],
            parts: msg.parts || [],
            tokenCount: msg.tokenCount || 0,
            totalTokens: msg.totalTokens || 0,
            promptTokens: msg.promptTokens || 0
          };
        }
        return msg;
      });
      branchPath.value = conv.branchPath || [];
    }

    conversationTitle.value = conv?.title || '';
    chatLoading.value = false;
    setActiveConversation(id || null);

    // Load compression sidecar and derive threshold/summary state.
    if (id) {
      await loadCompressionState(id);
      refreshCompressionState(id, visibleMessages.value, settingsManager.settings);
    }
  }

  /**
   * Edits a user message and creates a new branch
   */
  async function editUserMessage(messageId, newContent, newAttachments = null) {
    const existingMsg = messages.value.find(m => m.id === messageId);
    if (!existingMsg) return;

    const attachments = newAttachments !== null ? newAttachments : (existingMsg.attachments || []);

    const branchResult = createBranch(messages.value, messageId, {
      role: "user",
      content: newContent,
      attachments: attachments,
      complete: true
    });

    messages.value = branchResult.messages;
    branchPath.value = branchResult.branchPath;

    if (!isIncognito.value) {
      await storeMessages(currConvo.value, toRaw(messages.value), new Date());
      await updateBranchPath(currConvo.value, [...toRaw(branchPath.value)]);
    }

    const searchEnabled = settingsManager.settings?.search_enabled ?? false;
    await sendMessage(newContent, null, attachments, searchEnabled, { skipUserMessage: true });
  }

  /**
   * Regenerates an assistant message and creates a new branch
   */
  async function regenerateAssistantMessage(messageId) {
    const assistantMsg = messages.value.find(m => m.id === messageId);
    if (!assistantMsg || assistantMsg.role !== 'assistant') return;

    const userMsg = messages.value.find(m => m.id === assistantMsg.parentId);
    if (!userMsg) return;

    const visibleChain = getMessagesForBranchPath(messages.value, branchPath.value);

    const branchResult = createBranch(messages.value, assistantMsg.id, {
      role: "assistant",
      content: "",
      complete: false,
      timestamp: new Date()
    });

    const tempMsgId = branchResult.newMessage.id;
    messages.value = branchResult.messages.filter(m => m.id !== tempMsgId);
    branchPath.value = branchResult.branchPath;

    if (!isIncognito.value) {
      await updateBranchPath(currConvo.value, [...toRaw(branchPath.value)]);
    }

    const searchEnabled = settingsManager.settings?.search_enabled ?? false;
    await sendMessage(userMsg.content, null, userMsg.attachments || [], searchEnabled, {
      skipUserMessage: true,
      parentId: userMsg.id
    });
  }

  /**
   * Navigates to a different branch
   */
  async function navigateBranch(messageId, direction) {
    const info = branchInfo.value.get(messageId);
    if (!info) return;

    const newIndex = (info.current + direction + info.total) % info.total;
    branchPath.value = switchBranch(branchPath.value, info.forkIndex, newIndex);

    if (!isIncognito.value) {
      await updateBranchPath(currConvo.value, [...toRaw(branchPath.value)]);
    }
  }

  /**
   * Deletes a conversation
   */
  async function deleteConversation(id) {
    if (isIncognito.value) return;

    await deleteConv(id);
    deleteChatWorkspace(id);
    if (currConvo.value === id) {
      currConvo.value = '';
      messages.value = [];
      conversationTitle.value = '';
      setActiveConversation(null);
    }
  }

  /**
   * Starts a new conversation
   */
  async function newConversation() {
    currConvo.value = '';
    messages.value = [];
    conversationTitle.value = '';
    isIncognito.value = false;
    setActiveConversation(null);
  }

  /**
   * Toggles incognito mode
   */
  function toggleIncognito() {
    globalToggleIncognito();
  }

  // Return the reactive state and methods
  return {
    // State
    messages,
    visibleMessages,
    branchPath,
    branchInfo,
    isLoading,
    controller,
    currConvo,
    conversationTitle,
    isIncognito,
    isTyping,
    chatLoading,

    // Computed properties
    hasMessages,
    isEmptyConversation,

    // Methods
    sendMessage,
    changeConversation,
    deleteConversation,
    newConversation,
    toggleIncognito,
    generateId,
    setChatPanel,
    editUserMessage,
    regenerateAssistantMessage,
    navigateBranch
  };
}