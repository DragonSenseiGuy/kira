<script setup>
import { onMounted, onUnmounted, ref, watch, nextTick, computed, reactive } from "vue";
import { Icon } from "@iconify/vue";
import { md } from '../utils/markdown';
import { copyCode, downloadCode } from '../utils/codeBlockUtils';
import { buildMessageDebugDump } from '../utils/messageDebug';
import StreamingMessage from './StreamingMessage.vue';
import ChatWidget from './ChatWidget.vue';
import ContextSummaryMarker from './ContextSummaryMarker.vue';
import MessageEditArea from './MessageEditArea.vue';
import { useContextCompression } from '../composables/useContextCompression';
import { getFormattedStatsFromExecutedTools } from '../composables/searchViewStats';
import { highlightAllBlocks } from '../utils/lazyHighlight';
import { useDeveloperMode } from '../composables/useDeveloperMode';

// Debug tooling (e.g. the message debug copy button) is opt-in via
// Settings → General → Developer Mode.
const developerMode = useDeveloperMode();

const props = defineProps({
  currConvo: {
    type: [String, Number, Object],
    default: null
  },
  currMessages: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  conversationTitle: {
    type: String,
    default: ''
  },
  showWelcome: {
    type: Boolean,
    default: false
  },
  isDark: {
    type: Boolean,
    default: false
  },
  isIncognito: {
    type: Boolean,
    default: false
  },
  branchInfo: {
    type: Map,
    default: () => new Map()
  }
});

const emit = defineEmits(["send-message", "set-message", "scroll", "edit-message", "regenerate-message", "navigate-branch"]);

// Helper function to calculate message stats
function calculateMessageStats(message) {
  const stats = {};
  
  // Calculate delay (time from API call to first token)
  if (message.apiCallTime && message.firstTokenTime) {
    stats.delay = message.firstTokenTime.getTime() - message.apiCallTime.getTime();
  }
  
  // Token count
  if (message.tokenCount !== undefined) {
    stats.tokenCount = message.tokenCount;
  }
  
  // Calculate tokens per second
  if (message.tokenCount > 0 && message.firstTokenTime && message.completionTime) {
    const generationTimeMs = message.completionTime.getTime() - message.firstTokenTime.getTime();
    if (generationTimeMs > 0) {
      stats.tokensPerSecond = (message.tokenCount / generationTimeMs) * 1000;
    }
  }
  
  // Calculate total generation time (from first token to completion)
  if (message.firstTokenTime && message.completionTime) {
    stats.generationTime = message.completionTime.getTime() - message.firstTokenTime.getTime();
  }
  
  return stats;
}

// Format stats for display
function formatStatValue(value, type) {
  if (value === undefined || value === null) return null;
  
  switch (type) {
    case 'delay':
      // Format time in ms or seconds with 'wait' suffix
      return value < 1000 ? `${Math.round(value)}ms wait` : `${(value / 1000).toFixed(2)}s wait`;
    case 'generationTime':
      // Format time in ms or seconds with 'gen' suffix
      return value < 1000 ? `${Math.round(value)}ms gen` : `${(value / 1000).toFixed(2)}s gen`;
    case 'tokenCount':
      return `${Math.round(value)} tok`;
    case 'tokensPerSecond':
      return `${Math.round(value)} tok/s`;
    default:
      return value;
  }
}

// Reasoning status is split in two: a settled label once the model has
// finished thinking, and a start timestamp while it still is. The live case
// used to be a per-message 100ms interval rebuilding a string; UiAgentProgress
// owns that clock now, so nothing here has to tick.
const reasoningSettledLabels = reactive({});
const reasoningLiveSince = reactive({});
const messageLoadingStates = reactive({});

// Phase 2.2: Message stats cache
const messageStatsCache = reactive({});

// Context-compression boundary markers, derived from sidecar state.
// Maps anchor message id -> marker props; purely presentational.
const { getCompressionState } = useContextCompression();
const compressionMarkers = computed(() => {
  const map = new Map();
  if (!props.currConvo) return map;
  const state = getCompressionState(String(props.currConvo));
  if (!state) return map;
  for (const s of state.validSummaries || []) {
    if (s?.anchorMessageId) {
      map.set(s.anchorMessageId, {
        status: 'completed',
        sourceTokens: s.sourceTokens,
        summaryTokens: s.summaryTokens,
      });
    }
  }
  if (state.status === 'running' && state.runningAnchorId) {
    map.set(state.runningAnchorId, { status: 'in_progress' });
  }
  return map;
});

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Cycled by the pending indicator while the first token is outstanding. */
const PENDING_PHRASES = [
  "Thinking",
  "Reading the conversation",
  "Working through the details",
  "Preparing a response",
];

const isAtBottom = ref(true);
const chatWrapper = ref(null);

// Phase 2.2: Cached scroll container reference (found once on mount)
let cachedScrollContainer = null;

// Phase 3.2: Normalized messages with auto-migration for legacy messages
const normalizedMessages = computed(() => {
  if (!props.currMessages) return [];

  return props.currMessages.map(msg => {
    // Auto-migrate legacy assistant messages without parts
    if (msg.role === 'assistant' && (!msg.parts || msg.parts.length === 0)) {
      const parts = [];

      // Add reasoning part if present
      if (msg.reasoning) {
        parts.push({
          type: 'reasoning',
          content: msg.reasoning
        });
      }

      // Add tool_calls as individual tool_group parts
      // Each tool gets its own part to maintain proper ordering with other content types
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          parts.push({
            type: 'tool_group',
            _id: `tool-${toolCall.id || Math.random().toString(36).substring(2, 11)}`,
            tools: [toolCall]
          });
        }
      }

      // Add content part
      parts.push({
        type: 'content',
        content: msg.content || ''
      });

      return {
        ...msg,
        parts
      };
    }
    return msg;
  });
});

// Keep messages as alias for normalizedMessages for compatibility
const messages = normalizedMessages;

// Phase 2.2: Cached message stats with caching for complete messages
function getMessageStats(message) {
  if (message.role !== 'assistant') return [];

  // Use cache key based on message id and complete status
  const cacheKey = `${message.id}-${message.complete}`;

  // Return cached value if available for complete messages
  if (message.complete && messageStatsCache[cacheKey]) {
    return messageStatsCache[cacheKey];
  }

  const stats = calculateMessageStats(message);
  const formattedStats = [];

  // Add delay if available
  if (stats.delay !== undefined) {
    formattedStats.push({
      value: formatStatValue(stats.delay, 'delay')
    });
  }

  // Add token count if available
  if (stats.tokenCount !== undefined) {
    formattedStats.push({
      value: formatStatValue(stats.tokenCount, 'tokenCount')
    });
  }

  // Add tokens per second if available
  if (stats.tokensPerSecond !== undefined) {
    formattedStats.push({
      value: formatStatValue(stats.tokensPerSecond, 'tokensPerSecond')
    });
  }

  // Add generation time if available
  if (stats.generationTime !== undefined) {
    formattedStats.push({
      value: formatStatValue(stats.generationTime, 'generationTime')
    });
  }

  // Cache if message is complete
  if (message.complete) {
    messageStatsCache[cacheKey] = formattedStats;
  }

  return formattedStats;
}

// Find the scroll container by traversing up the DOM tree
// Used once on mount and cached for all subsequent scroll operations
function findScrollContainer() {
  // First, try to find container with class 'chat-section'
  let el = chatWrapper.value?.parentElement;
  if (el) {
    el = el.parentElement;
    if (el?.classList.contains('chat-section')) return el;
  }

  // Fallback: find by overflow style
  el = chatWrapper.value?.parentElement?.parentElement;
  let level = 0;
  while (el && el !== document.body && level < 10) {
    const style = getComputedStyle(el);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return el;
    el = el.parentElement;
    level++;
  }

  return null;
}

const scrollToEnd = (behavior = "instant") => {
  const container = cachedScrollContainer || chatWrapper.value;
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior });
  }
};

// Message currently spotlighted by a deep link / search result.
const highlightedMessageId = ref(null);
let highlightTimeout = null;

/**
 * Scrolls a specific message into view and flashes a highlight on it.
 *
 * Retries briefly because the caller may navigate and focus in the same tick,
 * before the target message has been rendered.
 *
 * @param {string} messageId - The message to focus.
 * @param {Object} [options]
 * @param {number} [options.retries=10] - Remaining animation frames to wait.
 * @returns {Promise<boolean>} Whether the message was found and focused.
 */
async function focusMessage(messageId, options = {}) {
  if (!messageId) return false;
  const { retries = 10 } = options;

  await nextTick();
  const element = chatWrapper.value?.querySelector(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  );

  if (!element) {
    if (retries <= 0) return false;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return focusMessage(messageId, { retries: retries - 1 });
  }

  element.scrollIntoView({ behavior: "smooth", block: "center" });

  highlightedMessageId.value = messageId;
  if (highlightTimeout) clearTimeout(highlightTimeout);
  highlightTimeout = setTimeout(() => {
    if (highlightedMessageId.value === messageId) highlightedMessageId.value = null;
  }, 2600);

  return true;
}

const handleScroll = () => {
  const container = cachedScrollContainer || chatWrapper.value;
  if (!container) return;

  const { scrollHeight, scrollTop, clientHeight } = container;
  isAtBottom.value = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
  emit('scroll', { isAtTop: scrollTop === 0 });
};

watch(
  messages,
  (newMessages) => {
    if (isAtBottom.value) {
      nextTick(() => scrollToEnd("instant"));
    }

    newMessages.forEach((msg) => {
      // Handle loading states for assistant messages
      if (msg.role === 'assistant') {
        // Show loading spinner for new messages that are not complete and have no content
        if (!msg.complete && (!msg.content || msg.content.length === 0)) {
          if (messageLoadingStates[msg.id] !== true) {
            messageLoadingStates[msg.id] = true;
          }
        }
        // Hide loading spinner as soon as the message has content (streaming started) or is complete
        else if ((msg.content && msg.content.length > 0) || msg.complete) {
          if (messageLoadingStates[msg.id] !== false) {
            messageLoadingStates[msg.id] = false;
          }
        }
      }

      if (msg.role === "assistant" && msg.reasoning) {
        if (msg.complete) {
          delete reasoningLiveSince[msg.id];

          if (msg.reasoningDuration) {
            reasoningSettledLabels[msg.id] =
              `Thought for ${formatDuration(msg.reasoningDuration)}`;
          }
          else if (msg.reasoningStartTime && msg.reasoningEndTime) {
            const duration =
              msg.reasoningEndTime.getTime() - msg.reasoningStartTime.getTime();
            reasoningSettledLabels[msg.id] =
              `Thought for ${formatDuration(duration)}`;
          }
          else if (msg.reasoningStartTime) {
            reasoningSettledLabels[msg.id] = "Thought for a moment";
          }
          return;
        }

        if (reasoningLiveSince[msg.id] === undefined) {
          reasoningLiveSince[msg.id] =
            (msg.reasoningStartTime || new Date()).getTime();
        }
      }
    });

    const currentMessageIds = newMessages.map((msg) => msg.id);
    Object.keys(reasoningSettledLabels).forEach((msgId) => {
      if (!currentMessageIds.includes(msgId)) delete reasoningSettledLabels[msgId];
    });
    Object.keys(reasoningLiveSince).forEach((msgId) => {
      if (!currentMessageIds.includes(msgId)) delete reasoningLiveSince[msgId];
    });

    // Clean up loading states for removed messages
    Object.keys(messageLoadingStates).forEach((msgId) => {
      if (!currentMessageIds.includes(msgId)) {
        delete messageLoadingStates[msgId];
      }
    });
  },
  { immediate: true },
);

watch(
  () => props.currConvo,
  (newConvo, oldConvo) => {
    if (newConvo && newConvo !== oldConvo) {
      nextTick(() => {
        requestAnimationFrame(() => {
          scrollToEnd("instant");
        });
      });
    }
  }
);

onMounted(() => {
  nextTick(() => scrollToEnd("instant"));

  // Find and cache the scroll container once
  cachedScrollContainer = findScrollContainer();

  const scrollTarget = cachedScrollContainer || document;
  scrollTarget.addEventListener('scroll', handleScroll, { passive: true });

  // Trigger initial scroll check
  handleScroll();

  // Make functions available globally (only in browser)
  if (typeof window !== 'undefined') {
    window.copyCode = copyCode;
    window.downloadCode = downloadCode;
  }
});

onUnmounted(() => {
  // Clean up scroll listener from cached container or document fallback
  const scrollTarget = cachedScrollContainer || document;
  scrollTarget.removeEventListener('scroll', handleScroll);
});

// Render message content with markdown and trigger lazy highlighting.
// Complete content never changes, so rendered HTML is memoized by content
// string — re-renders of a streaming message skip re-parsing finished
// content groups entirely.
const markdownHtmlCache = new Map();
const MARKDOWN_CACHE_MAX = 200;

function renderMessageContent(content) {
  const key = content || '';
  const cached = markdownHtmlCache.get(key);
  if (cached !== undefined) return cached;

  const html = md.render(key);

  if (markdownHtmlCache.size >= MARKDOWN_CACHE_MAX) {
    markdownHtmlCache.clear();
  }
  markdownHtmlCache.set(key, html);

  // Schedule lazy highlighting for any code blocks in the rendered HTML
  nextTick(() => {
    if (chatWrapper.value) {
      highlightAllBlocks(chatWrapper.value);
    }
  });

  return html;
}

// Function to handle when a streaming message is complete
function onStreamingMessageComplete(messageId) {
  // Set loading state to false when streaming is complete
  if (messageLoadingStates[messageId] !== false) {
    messageLoadingStates[messageId] = false;
  }
}

// Function to get formatted search/view statistics string for display
function getFormattedStatsForDisplay(messageId) {
  const message = messages.value.find(m => m.id === messageId);
  if (!message) {
    return '';
  }

  return getFormattedStatsFromExecutedTools(message.executed_tools || []);
}

// Extract all text content from a message for copying
function getMessageCopyText(message) {
  // If message has parts, concatenate all content-type parts
  if (message.parts && message.parts.length > 0) {
    return message.parts
      .filter(part => part.type === 'content')
      .map(part => part.content)
      .join('\n\n');
  }
  // Fallback to legacy content field for user messages
  return message.content || '';
}

// Function to copy message content
function copyMessage(message, event) {
  const button = event.currentTarget;
  const textToCopy = getMessageCopyText(message);

  navigator.clipboard.writeText(textToCopy).then(() => {
    // Visual feedback - temporarily change button to success state
    button.classList.add('copied');

    setTimeout(() => {
      button.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy message:', err);
    // Visual feedback for error - could add error styling here
  });
}

// Copy a diagnostic report (timings, usage, part structure, tool calls).
// Long bodies are previewed rather than dumped — "Copy message" above is
// the button for the actual text.
function copyDebugDump(message, event) {
  const button = event.currentTarget;
  navigator.clipboard
    .writeText(buildMessageDebugDump(message))
    .then(() => {
      button.classList.add('copied');
      setTimeout(() => button.classList.remove('copied'), 2000);
    })
    .catch((err) => console.error('Failed to copy debug dump:', err));
}

// --- Branching Logic ---
const editingMessageId = ref(null);

function startEditing(message) {
  editingMessageId.value = message.id;
}

function cancelEditing() {
  editingMessageId.value = null;
}

function submitEdit(messageId, newContent, newAttachments) {
  emit("edit-message", messageId, newContent, newAttachments);
  editingMessageId.value = null;
}

function regenerateMessage(messageId) {
  emit("regenerate-message", messageId);
}

function navigateBranch(messageId, direction) {
  emit("navigate-branch", messageId, direction);
}

// Function to determine CSS classes for parts based on their position and adjacent parts
function getPartClass(partType, index, parts) {
  // Only apply special styling to reasoning and tool_group parts
  if (partType !== 'reasoning' && partType !== 'tool_group') {
    return '';
  }

  const partClasses = [];
  const previousPart = index > 0 ? parts[index - 1] : null;
  const nextPart = index < parts.length - 1 ? parts[index + 1] : null;

  // Add class if this is the first part or if the previous part is not reasoning/tool_group
  if (index === 0 || (previousPart && previousPart.type !== 'reasoning' && previousPart.type !== 'tool_group')) {
    partClasses.push('has-previous-content');
  }

  // Add class if this is the last part or if the next part is not reasoning/tool_group
  if (index === parts.length - 1 || (nextPart && nextPart.type !== 'reasoning' && nextPart.type !== 'tool_group')) {
    partClasses.push('has-next-content');
  }

  return partClasses.join(' ');
}

// Function to group adjacent reasoning and tool_group parts together
// Sequential tools/reasoning are visually grouped but each tool gets its own widget
function getPartGroupsUncached(parts) {
  if (!parts || parts.length === 0) return [];

  const groups = [];
  let currentGroup = [];
  let currentGroupType = null; // 'mixed' for reasoning/tool_group, 'content' for content, 'image' for images

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Determine if this part should be grouped with the current group
    const isActionPart = (part.type === 'reasoning' || part.type === 'tool_group');
    const isContentPart = (part.type === 'content');
    const isImagePart = (part.type === 'image');

    // If this is an action part (reasoning/tool_group) and we're either starting or continuing an action group
    if (isActionPart) {
      if (currentGroupType !== 'mixed') {
        // Start a new mixed group if we were in a different type
        if (currentGroup.length > 0) {
          groups.push({ type: currentGroupType, parts: currentGroup });
        }
        currentGroup = [part];
        currentGroupType = 'mixed';
      } else {
        // Add to current mixed group
        currentGroup.push(part);
      }
    }
    // If this is a content part and we're either starting or continuing a content group
    else if (isContentPart) {
      if (currentGroupType !== 'content') {
        // Start a new content group if we were in a different type
        if (currentGroup.length > 0) {
          groups.push({ type: currentGroupType, parts: currentGroup });
        }
        currentGroup = [part];
        currentGroupType = 'content';
      } else {
        currentGroup.push(part);
      }
    }
    // If this is an image part and we're either starting or continuing an image group
    else if (isImagePart) {
      if (currentGroupType !== 'image') {
        // Start a new image group if we were in a different type
        if (currentGroup.length > 0) {
          groups.push({ type: currentGroupType, parts: currentGroup });
        }
        currentGroup = [part];
        currentGroupType = 'image';
      } else {
        currentGroup.push(part);
      }
    }
  }

  // Push the last group
  if (currentGroup.length > 0) {
    groups.push({ type: currentGroupType, parts: currentGroup });
  }

  return groups;
}

/**
 * Memoized grouping. The template calls getPartGroups several times per
 * message per render; since parts arrays are replaced (never mutated),
 * a WeakMap keyed on array identity caches cleanly across frames.
 */
const partGroupsCache = new WeakMap();

function getPartGroups(parts) {
  if (!parts || parts.length === 0) return [];
  let groups = partGroupsCache.get(parts);
  if (!groups) {
    groups = getPartGroupsUncached(parts);
    partGroupsCache.set(parts, groups);
  }
  return groups;
}

// Function to determine CSS classes for part groups based on their position and adjacent groups
function getPartGroupClass(group, index, groups) {
  const groupClasses = [];

  // Only apply special styling to mixed groups (reasoning/tool_group)
  if (group.type === 'mixed') {
    const previousGroup = index > 0 ? groups[index - 1] : null;
    const nextGroup = index < groups.length - 1 ? groups[index + 1] : null;

    // Add class if this is the first group or if the previous group is content
    if (index === 0 || (previousGroup && previousGroup.type === 'content')) {
      groupClasses.push('has-previous-content');
    }

    // Add class if this is the last group or if the next group is content
    if (index === groups.length - 1 || (nextGroup && nextGroup.type === 'content')) {
      groupClasses.push('has-next-content');
    }
  }

  return groupClasses.join(' ');
}

onUnmounted(() => {
  if (highlightTimeout) clearTimeout(highlightTimeout);
});

defineExpose({ scrollToEnd, focusMessage, isAtBottom, chatWrapper });
</script>

<template>
  <div class="chat-wrapper" ref="chatWrapper">
    <div class="chat-container">
      <div v-if="messages.length < 1 && showWelcome" class="welcome-container">
        <h1 v-if="!isIncognito" class="welcome-message">What can I help with?</h1>
        <div v-if="!isIncognito" class="suggestion-chips">
          <button class="suggestion-chip" @click="emit('set-message', 'Help me create something new and interesting')">
            <Icon icon="material-symbols:auto-fix-high-outline" width="16" height="16" />
            <span>Create</span>
          </button>
          <button class="suggestion-chip" @click="emit('set-message', 'Help me explore a topic I\'m curious about')">
            <Icon icon="material-symbols:travel-explore" width="16" height="16" />
            <span>Explore</span>
          </button>
          <button class="suggestion-chip" @click="emit('set-message', 'Help me write or debug some code')">
            <Icon icon="material-symbols:code" width="16" height="16" />
            <span>Code</span>
          </button>
          <button class="suggestion-chip" @click="emit('set-message', 'Help me learn something new today')">
            <Icon icon="material-symbols:school-outline" width="16" height="16" />
            <span>Learn</span>
          </button>
        </div>
        <div v-if="!isIncognito" class="example-questions">
          <button class="example-question" @click="emit('set-message', 'How does AI actually work?')">
            <span>How does AI actually work?</span>
          </button>
          <div class="example-divider"></div>
          <button class="example-question" @click="emit('set-message', 'Are black holes real?')">
            <span>Are black holes real?</span>
          </button>
          <div class="example-divider"></div>
          <button class="example-question" @click="emit('set-message', 'How many Rs are in the word &quot;strawberry&quot;?')">
            <span>How many Rs are in the word "strawberry"?</span>
          </button>
          <div class="example-divider"></div>
          <button class="example-question" @click="emit('set-message', 'What is the meaning of life?')">
            <span>What is the meaning of life?</span>
          </button>
        </div>
        <div v-else class="incognito-welcome">
          <h1 class="incognito-title">Incognito Mode</h1>
          <p class="incognito-description">
            This chat won't be stored and will not use Kira's memory or personalization features.
          </p>
        </div>
      </div>
      <div class="messages-layer">
        <template v-for="message in messages" :key="message.id">
          <div
            class="message"
            :class="[message.role, { 'message-focused': highlightedMessageId === message.id }]"
            :data-message-id="message.id"
          >
            <div class="message-content">
                  <!-- Pending: the request is away but nothing has come back yet.
                       Suppressed once any part exists, because the reasoning
                       widget carries its own live status from there on. -->
                  <div
                    v-if="messageLoadingStates[message.id] && !(message.parts && message.parts.length > 0)"
                    class="loading-animation"
                  >
                    <UiAgentReasoningText :phrases="PENDING_PHRASES" />
                  </div>

                  <!-- New Parts-Based Rendering -->
                  <div v-if="message.parts && message.parts.length > 0" class="message-parts-container">
                    <template v-for="(group, groupIndex) in getPartGroups(message.parts)" :key="`group-${groupIndex}-${group.parts.map(p => p._id).join('-')}`">
                      <!-- Mixed group (reasoning + tools) - sequential actions grouped together -->
                      <div
                        v-if="group.type === 'mixed'"
                        :class="['part-group-container', getPartGroupClass(group, groupIndex, getPartGroups(message.parts))]"
                      >
                        <template v-for="(part, partIndex) in group.parts" :key="part._id || `part-${groupIndex}-${partIndex}`">
                          <!-- Reasoning Part inside group -->
                          <div v-if="part.type === 'reasoning'" class="part-reasoning inside-group">
                            <ChatWidget
                              type="reasoning"
                              :content="part.content"
                              :status="reasoningSettledLabels[message.id] || 'Reasoning Process'"
                              :live-since="reasoningLiveSince[message.id] ?? null"
                            />
                          </div>

                          <!-- Tool Group Part inside group - each tool gets its own widget -->
                          <div v-else-if="part.type === 'tool_group'" class="part-tool-group inside-group">
                            <ChatWidget
                              type="tool"
                              :tool-calls="part.tools"
                              :streaming="!message.complete"
                            />
                          </div>
                        </template>
                      </div>

                      <!-- Individual content parts -->
                      <div
                        v-else-if="group.type === 'content'"
                        class="part-content"
                      >
                         <div v-if="message.complete || groupIndex < getPartGroups(message.parts).length - 1"
                              class="markdown-content"
                              v-html="renderMessageContent(group.parts[0].content)"></div>
                         <div v-else>
                            <StreamingMessage
                              :content="group.parts[0].content"
                              :is-complete="message.complete && groupIndex === getPartGroups(message.parts).length - 1"
                              @complete="onStreamingMessageComplete(message.id)"
                            />
                         </div>
                      </div>

                      <!-- Image parts -->
                      <div
                        v-else-if="group.type === 'image'"
                        class="part-image"
                      >
                        <div class="image-grid">
                          <template v-for="(part, partIndex) in group.parts" :key="`part-${partIndex}`">
                            <div
                              v-for="(image, imageIndex) in part.images"
                              :key="`image-${partIndex}-${imageIndex}`"
                              class="image-container"
                            >
                              <img
                                :src="image.url"
                                :alt="image.revised_prompt || 'Generated image'"
                                loading="lazy"
                              />
                              <div v-if="image.revised_prompt" class="image-caption">
                                {{ image.revised_prompt }}
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- User messages without parts (not applicable for assistant due to auto-migration) -->
                  <div v-else-if="message.role === 'user'" class="bubble" :class="{ 'editing': editingMessageId === message.id }">
                    <div class="user-message-content">
                      <!-- Display attached files (normal view) -->
                      <div v-if="editingMessageId !== message.id && message.attachments?.length" class="message-attachments">
                        <div
                          v-for="attachment in message.attachments"
                          :key="attachment.id"
                          class="attachment-thumbnail"
                          :class="attachment.type"
                        >
                          <img
                            v-if="attachment.type === 'image'"
                            :src="attachment.dataUrl"
                            :alt="attachment.filename"
                            loading="lazy"
                          />
                          <div v-else class="pdf-attachment">
                            <Icon icon="material-symbols:picture-as-pdf" width="24" height="24" />
                            <span class="pdf-filename">{{ attachment.filename }}</span>
                          </div>
                        </div>
                      </div>
                      <!-- Message text -->
                      <div v-if="editingMessageId !== message.id" class="user-text">{{ message.content }}</div>
                      <!-- Edit area -->
                      <div v-else class="edit-area">
                        <MessageEditArea
                          :message="message"
                          @submit="(content, attachments) => submitEdit(message.id, content, attachments)"
                          @cancel="cancelEditing"
                        />
                      </div>
                    </div>
                  </div>
              <div class="message-content-footer" :class="{ 'user-footer': message.role === 'user' }">
                <div class="footer-left-actions">
                  <UiTooltip content="Copy message">
                    <UiIconButton
                      class="footer-action-btn copy-button"
                      icon="material-symbols:content-copy-outline-rounded"
                      label="Copy message"
                      size="sm"
                      @click="copyMessage(message, $event)"
                    />
                  </UiTooltip>

                  <UiTooltip
                    v-if="message.role === 'assistant' && developerMode"
                    content="Copy debug info (timings, usage, tool calls)"
                  >
                    <UiIconButton
                      class="footer-action-btn debug-copy-button"
                      icon="material-symbols:bug-report-outline-rounded"
                      label="Copy debug info"
                      size="sm"
                      @click="copyDebugDump(message, $event)"
                    />
                  </UiTooltip>

                  <!-- Edit button for user messages -->
                  <UiTooltip v-if="message.role === 'user'" content="Edit message">
                    <UiIconButton
                      class="footer-action-btn edit-button"
                      icon="material-symbols:edit-outline-rounded"
                      label="Edit message"
                      size="sm"
                      @click="startEditing(message)"
                    />
                  </UiTooltip>

                  <!-- Regenerate button for assistant messages -->
                  <UiTooltip v-if="message.role === 'assistant' && message.complete" content="Regenerate response">
                    <UiIconButton
                      class="footer-action-btn regenerate-button"
                      icon="material-symbols:refresh-rounded"
                      label="Regenerate response"
                      size="sm"
                      @click="regenerateMessage(message.id)"
                    />
                  </UiTooltip>
                </div>

                <!-- Branch Navigation -->
                <div v-if="branchInfo.has(message.id)" class="branch-navigation">
                  <UiIconButton
                    class="nav-prev"
                    icon="material-symbols:chevron-left-rounded"
                    label="Previous branch"
                    size="sm"
                    :disabled="branchInfo.get(message.id).current === 0"
                    @click="navigateBranch(message.id, -1)"
                  />
                  <span class="branch-counter">
                    {{ branchInfo.get(message.id).current + 1 }} / {{ branchInfo.get(message.id).total }}
                  </span>
                  <UiIconButton
                    class="nav-next"
                    icon="material-symbols:chevron-right-rounded"
                    label="Next branch"
                    size="sm"
                    :disabled="branchInfo.get(message.id).current === branchInfo.get(message.id).total - 1"
                    @click="navigateBranch(message.id, 1)"
                  />
                </div>

                <template v-if="message.role === 'assistant'">
                  <div class="message-stats-row" v-for="(stats, _) in [getMessageStats(message)]" :key="_">
                    <span v-for="(stat, index) in stats" :key="index" class="stat-item">
                      <span v-if="stat.value" class="stat-value">{{ stat.value }}</span>
                      <span v-if="stat.value && index < stats.length - 1" class="stat-separator"> • </span>
                    </span>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <!-- Presentational divider at a summary boundary (sidecar-derived). -->
          <ContextSummaryMarker
            v-if="compressionMarkers.has(message.id)"
            v-bind="compressionMarkers.get(message.id)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style>
.chat-wrapper {
  --text-primary-light: var(--text-primary);
  --text-secondary-light: var(--text-secondary);
  --text-primary-dark: var(--text-primary);
  --text-secondary-dark: var(--text-secondary);
  flex: 1;
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

.chat-container {
  width: 100%;
  max-width: var(--chat-width);
  margin: 0 auto;
  padding: 12px 0;
  box-sizing: border-box;
  position: relative;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
  padding-bottom: 120px;
}

/* Cold-start screen. ChatGPT centres a single short question and puts the
   composer directly under it — the suggestions are secondary, so they read
   quieter than the heading rather than competing with it. */
.welcome-container {
  text-align: center;
  margin: calc(1rem + 12vh) 0 1.5rem;
  width: 100%;
  max-width: 640px;
  margin-left: auto;
  margin-right: auto;
}

.welcome-message {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 1.75rem 0;
  letter-spacing: -0.015em;
}

.suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  margin-bottom: 2rem;
}

.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 14px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  box-shadow: 0 0 0 1px var(--line-strong);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 400;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out-strong);
}

.suggestion-chip:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.suggestion-chip:active {
  transform: scale(var(--press-scale));
}

/* Example questions list */
.example-questions {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  text-align: left;
}

.example-question {
  width: 100%;
  padding: 14px 4px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: color var(--duration-fast) var(--ease-out);
}

.example-question:hover {
  color: var(--text-primary);
}

.example-divider {
  width: 100%;
  height: 1px;
  background: var(--border);
  opacity: 0.5;
}

.incognito-title {
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 1rem 0;
}

.incognito-description {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

/* One turn. The vertical rhythm between turns does the grouping work; there
   are no rules or panels between them. */
.message {
  display: block;
  width: 100%;
  max-width: var(--chat-width);
  margin: 0 auto;
  padding: 10px 0;
  position: relative;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
}

.message.user {
  justify-content: flex-end;
  display: flex;
  width: 100%;
}

/*
  Transient spotlight applied when a search result or deep link jumps to a
  message. The glow fades on its own so the chat returns to its normal look.
*/
.message-focused {
  border-radius: var(--radius-card);
  animation: message-spotlight 2.6s ease-out forwards;
}

@keyframes message-spotlight {
  0% {
    background-color: transparent;
    box-shadow: 0 0 0 0 transparent;
  }
  12%, 70% {
    background-color: var(--focus-ring);
    box-shadow: 0 0 0 8px var(--focus-ring);
  }
  100% {
    background-color: transparent;
    box-shadow: 0 0 0 8px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-focused {
    animation: none;
    background-color: var(--focus-ring);
    box-shadow: 0 0 0 8px var(--focus-ring);
  }
}

.message-content {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
}

.message.user .message-content {
  align-items: flex-end;
  max-width: 80%;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.bubble {
  display: block;
  padding: 10px 20px;
  border-radius: var(--radius-bubble);
  line-height: 1.7;
  font-size: 1rem;
  width: 100%;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
}

/* The user turn is a grey capsule, evenly rounded — no tail, no ring, no
   accent fill. Only the assistant's text runs the full column. */
.message.user .bubble {
  background: var(--color-bubble-user-bg);
  color: var(--color-bubble-user-text);
  box-shadow: none;
  white-space: pre-wrap;
  margin-left: auto;
  max-width: calc(var(--chat-width) * 0.8);
  width: fit-content;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
  text-align: left;
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
  /* Ensure text alignment within the bubble */
}

.message.assistant .bubble {
  padding: 0;
  color: var(--text-primary-light);
  width: 100%;
  max-width: var(--chat-width);
  margin: 0 auto;
  line-height: 1.75;
  transition:
    background-color var(--duration-slow) var(--ease-out-strong),
    color var(--duration-slow) var(--ease-out-strong),
    box-shadow var(--duration-slow) var(--ease-out-strong),
    transform var(--duration-slow) var(--ease-out-strong),
    opacity var(--duration-slow) var(--ease-out-strong);
}

.dark .message.assistant .bubble {
  color: var(--text-primary-dark);
}



/* Note: .markdown-content base styles are now in code-blocks.css */

/* Both turns read at the same size. The user capsule sets 1rem on .bubble,
   but the assistant's prose is a nested .markdown-content that would
   otherwise fall back to the 14px body size — scoped here rather than in
   code-blocks.css, which the reasoning card and file previews also use. */
.message.assistant .markdown-content {
  font-size: 1rem;
  line-height: 1.75;
}

.copy-button-container {
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.message:hover .copy-button-container {
  opacity: 1;
}

.copy-button-container.user-copy-container {
  display: flex;
  justify-content: flex-end;
}

.copy-button {
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  width: 32px;
  height: 32px;
  padding: 6px;
  cursor: pointer;
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out),
    transform var(--duration) var(--ease-out),
    opacity var(--duration) var(--ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.copy-button:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.footer-left-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.branch-navigation {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius-full);
  padding: 2px 4px;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  box-shadow: var(--shadow-hairline);
}

.message.user .branch-navigation {
  margin: 0 8px
}

.branch-counter {
  min-width: 30px;
  text-align: center;
  font-weight: 500;
  user-select: none;
}

.branch-navigation button {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: var(--radius-full);
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out),
    transform var(--duration) var(--ease-out),
    opacity var(--duration) var(--ease-out);
}

.branch-navigation button:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--btn-hover);
}

.branch-navigation button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Edit Area Styles */
.edit-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.edit-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.edit-attachment-item {
  position: relative;
  border-radius: var(--radius-control);
  overflow: hidden;
  box-shadow: var(--shadow-hairline);
}

.edit-attachment-item.image {
  max-width: 120px;
  max-height: 120px;
}

.edit-attachment-item.image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.edit-attachment-item.pdf {
  background: var(--overlay-hover);
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-pdf-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.edit-pdf-filename {
  font-size: 0.85rem;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove-attachment-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--scrim);
  border: none;
  border-radius: var(--radius-full);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--destructive-foreground);
  padding: 0;
}

.remove-attachment-btn:hover {
  background: var(--red);
  color: var(--destructive-foreground);
}

.edit-textarea {
  width: 100%;
  min-height: 80px;
  max-height: min(70vh, 600px);
  padding: 12px 14px;
  border-radius: var(--radius-card);
  border: none;
  box-shadow: var(--shadow-hairline);
  background: var(--card);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.55;
  resize: none;
  outline: none;
  overflow-y: auto;
  box-sizing: border-box;
  transition:
    background-color var(--duration) var(--ease-out),
    color var(--duration) var(--ease-out),
    box-shadow var(--duration) var(--ease-out),
    transform var(--duration) var(--ease-out),
    opacity var(--duration) var(--ease-out);
}

.edit-textarea::placeholder {
  color: var(--text-placeholder);
}

.edit-textarea:focus {
  box-shadow: 0 0 0 1px var(--ink-3);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}


/* Editing state for bubble */
.message.user .bubble.editing {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.copy-button.copied {
  color: var(--success) !important;
}

.message-content-footer {
  display: flex;
  align-items: center;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.message:hover .message-content-footer {
  opacity: 0.7;
}

.message-content-footer:hover {
  opacity: 1 !important;
}

.user-footer {
  justify-content: flex-end;
}

.message-stats-row {
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  color: var(--text-secondary-light);
  margin-left: 8px;
  user-select: none;
}

.dark .message-stats-row {
  color: var(--text-secondary-dark);
}

.stat-item {
  display: flex;
  align-items: center;
}

.stat-value {
  white-space: nowrap;
}

.stat-separator {
  margin: 0 4px;
  color: var(--text-secondary-light);
}

.dark .stat-separator {
  color: var(--text-secondary-dark);
}

.search-view-stats {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  margin-bottom: 12px;
  margin-left: 0; /* Reset left margin to align with container */
  user-select: none; /* Prevent text selection */
  -webkit-user-select: none; /* Safari/Chrome */
  -moz-user-select: none; /* Firefox */
  -ms-user-select: none; /* IE/Edge */
  order: -2; /* Ensure it appears above reasoning details which has order: -1 */
  box-shadow: var(--shadow-hairline);
  border: none;
  width: fit-content;
}

.memory-adjustment-notification {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary-light);
  padding: 6px 12px;
  border-radius: var(--radius-xl);
  margin-bottom: 12px;
  margin-left: 0; /* Reset left margin to align with container */
  user-select: none; /* Prevent text selection */
  -webkit-user-select: none; /* Safari/Chrome */
  -moz-user-select: none; /* Firefox */
  -ms-user-select: none; /* IE/Edge */
  order: -3; /* Ensure it appears above other elements like reasoning details */
  border: 1px solid var(--border);
  width: fit-content;
  align-self: flex-start;
}

.loading-animation {
  display: flex;
  padding: 12px 16px;
  width: 100%;
  box-sizing: border-box;
  align-items: center;
}

/* --- MESSAGE ATTACHMENTS --- */
.user-message-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-text {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}

.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachment-thumbnail {
  border-radius: var(--radius-control);
  overflow: hidden;
}

.attachment-thumbnail.image img {
  max-width: 250px;
  max-height: 250px;
  object-fit: contain;
  border-radius: var(--radius-control);
  display: block;
}

.attachment-thumbnail.pdf {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--overlay-hover);
  border-radius: var(--radius-control);
}

.pdf-attachment {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pdf-attachment svg {
  flex-shrink: 0;
  opacity: 0.9;
}

.pdf-filename {
  font-size: 0.85rem;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.9;
}

/* Tool Widgets Container */
.tool-widgets-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  width: 100%;
  max-width: var(--chat-width);
}

/* Reasoning Card Styles */
.reasoning-card {
  margin-bottom: 12px;
  width: 100%;
  max-width: var(--chat-width);
}


/* Part Group Container Styling - for grouping adjacent reasoning and tool_group parts */
.part-group-container {
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  overflow: hidden; /* Contain the individual parts within the container */
  margin: 12px 0 0; /* Add some spacing between groups */
  position: relative;
  background-color: var(--bg-secondary);
}

/* The container itself is the only outline: widgets inside drop their own
   ring, radius and vertical margin so they read as rows of one card. */
.part-group-container .chat-widget {
  margin: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.part-group-container .chat-widget:hover {
  box-shadow: none;
}

/* Divider between stacked widgets instead of a second outline */
.part-group-container > .inside-group:not(:last-child) {
  border-bottom: 1px solid var(--border);
}

/* Each inside-group needs position:relative for its ::after to position correctly */
.inside-group {
  position: relative;
}

/* Connection line segments between icons */
.inside-group:not(:last-child)::after {
  content: "";
  position: absolute;
  left: 21px; /* Nudged 1px left for perfect alignment */
  top: calc(100% - 6px); /* Start 6px before the bottom edge */
  height: 12px; /* 6px in this element + 6px into the next = centered */
  width: 0;
  border-left: 1px solid var(--border);
  z-index: 1;
  pointer-events: none;
  opacity: 1;
}

/* Remove border-radius from first element's bottom corners when inside a container */
.part-group-container > :first-child {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

/* Remove border-radius from last element's top corners when inside a container */
.part-group-container > :last-child {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

/* Remove border-radius from middle elements */
.part-group-container > :not(:first-child):not(:last-child) {
  border-radius: 0;
}

/* Remove border from the last item in the group */
.part-group-container > :last-child {
  border-bottom: none;
}

.part-content {
  margin-top: 12px;
  min-height: 20px;
}

.message-parts-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* Image part styles */
.part-image {
  margin: 12px 0;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.image-container {
  position: relative;
  overflow: hidden;
}

.image-container img {
  height: auto;
  display: block;
  max-height: 300px;
  object-fit: contain;
}

.image-caption {
  padding: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  border-top: 1px solid var(--border);
  background: var(--bg-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
