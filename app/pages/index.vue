<template>
  <div class="chat-section">
    <div class="chat-column">
      <div v-if="conversationError" class="conversation-error" role="alert">
        ⚠️ {{ conversationError }}
      </div>
      <ChatPanel
        ref="chatPanelRef"
        :curr-convo="currConvo"
        :curr-messages="visibleMessages"
        :is-loading="isLoading"
        :conversation-title="conversationTitle"
        :branch-info="branchInfo"
        :show-welcome="!currConvo && !isTyping"
        :is-dark="isDark"
        :is-incognito="isIncognito"
        @set-message="text => messageFormRef?.setMessage(text)"
        @scroll="handleChatScroll"
        @edit-message="editUserMessage"
        @regenerate-message="regenerateAssistantMessage"
        @navigate-branch="navigateBranch"
      />
      <ContextCompressionChip
        :conversation-id="currConvo"
        :get-visible-messages="() => { const v = visibleMessages; return v && 'value' in v ? v.value : v; }"
        :branch-path="branchPath"
        :is-incognito="isIncognito"
      />
      <MessageForm
        ref="messageFormRef"
        :is-loading="isLoading"
        :selected-model-id="settingsManager.settings.selected_model_id"
        :models="hcFullModels"
        :selected-model-name="selectedModelName"
        :settings-manager="settingsManager"
        :conversation-id="currConvo"
        @typing="isTyping = true"
        @empty="isTyping = false"
        @send-message="sendMessage"
        @abort-controller="controller.abort()"
      />
    </div>
  </div>
</template>

<script setup>
// This page is for creating a new conversation (replaces the /new route)
import { ref, nextTick, onMounted, computed, watch, onBeforeUnmount } from 'vue';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/github-dark.css';
import { useDark } from "@vueuse/core";
import { useRoute, useRouter } from '#app';
import { useHead } from '#imports';

import { findModelById } from '~/composables/availableModels';
import { hcFullModels } from '~/composables/providers';
import { useSettings } from '~/composables/useSettings';
import { useConversation } from '~/composables/useConversation';
import { useGlobalScrollStatus } from '~/composables/useGlobalScrollStatus';

import ChatPanel from '~/components/ChatPanel.vue';
import ContextCompressionChip from '~/components/ContextCompressionChip.vue';

// Get the route
const route = useRoute();
const router = useRouter();

const isDark = useDark();

// Use the shared settings instance
const settingsManager = useSettings();

// Initialize conversation state and methods
const {
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
  sendMessage: originalSendMessage,
  editUserMessage,
  regenerateAssistantMessage,
  navigateBranch,
  changeConversation,
  deleteConversation,
  newConversation,
  toggleIncognito,
  setChatPanel,
  chatPanel, // This is the chat panel ref from the composable
  createNewConversationWithMessage // Function for creating conversation with first message
} = useConversation();

// Surfaced when local storage refuses to persist a new conversation.
const conversationError = ref('');

// Override sendMessage to create conversation and navigate immediately
async function sendMessage(message, originalMessage = null, attachments = [], searchEnabled = false) {
  if ((!message.trim() && attachments.length === 0) || isLoading.value) return;

  conversationError.value = '';

  // Store search enabled state in settings for the conversation
  if (settingsManager) {
    settingsManager.settings.search_enabled = searchEnabled;
    await settingsManager.saveSettings();
  }

  if (isIncognito.value) {
    // If in incognito mode, navigate to the incognito route with the message
    // Note: Attachments in incognito mode are not supported for initial message
    // as we can't pass large base64 data via query params
    await router.push({ path: '/incognito', query: { initialMessage: message, searchEnabled: searchEnabled.toString() } });
  } else {
    try {
      // Create a new conversation with the initial message and attachments
      const conversationId = await createNewConversationWithMessage(message, attachments);

      // Navigate immediately to the new conversation
      // The [id].vue route will detect this is a new conversation and trigger the AI response
      await router.push(`/${conversationId}`);
    } catch (error) {
      // Storage failure: keep the user here with their draft intact and
      // surface the problem instead of navigating to a broken conversation.
      console.error('Failed to create conversation:', error);
      conversationError.value = 'Could not save this conversation. Please check available storage space and try again.';
    }
  }
}

const messageFormRef = ref(null); // Reference to the MessageForm component
const chatPanelRef = ref(null); // Reference to the ChatPanel component

// Use global scroll status instead of local ref
const { setIsScrolledTop } = useGlobalScrollStatus();

onMounted(async () => {
  await settingsManager.loadSettings();
  // No manual default setting needed here as Settings class handles it now


  // Set the chat panel reference (used by useConversation for scrollToEnd, etc.)
  setChatPanel(chatPanelRef.value);

  // Handle initial prompt from URL query parameter (e.g. /?q=Hello)
  const initialPrompt = route.query.q;
  const initialModel = route.query.model;
  if (initialPrompt && typeof initialPrompt === 'string' && initialPrompt.trim()) {
    await nextTick();

    if (typeof initialModel === 'string' && initialModel.trim()) {
      const normalizedModel = decodeURIComponent(initialModel).trim();
      const modelCandidates = [
        normalizedModel,
        normalizedModel.includes('/') ? null : normalizedModel.replace('-', '/'),
      ].filter(Boolean);

      const matchedModel = modelCandidates
        .map(candidate => findModelById(hcFullModels, candidate))
        .find(Boolean);

      const matchedByName = hcFullModels.find(
        model => model.name.toLowerCase() === normalizedModel.toLowerCase(),
      );

      if (matchedModel || matchedByName) {
        settingsManager.settings.selected_model_id = (matchedModel || matchedByName).id;
      }
    }

    await sendMessage(initialPrompt.trim());
  }
});

// Use selectedModelName from settingsManager
const selectedModelName = computed(() => settingsManager.selectedModelName);

/**
 * Handles scroll events from the ChatPanel component.
 * @param {Object} event - The scroll event object
 * @param {boolean} event.isAtTop - Whether the user is scrolled to the top
 */
function handleChatScroll(event) {
  setIsScrolledTop(event.isAtTop);
}

// Update page head dynamically
useHead({
  title: 'New Chat - Kira',
  meta: [
    { name: 'description', content: 'Start a new conversation with the AI assistant' }
  ]
});
</script>

<style scoped>
/* Storage-failure banner */
.conversation-error {
  margin: 12px auto 0;
  padding: 10px 14px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
  font-size: 0.9rem;
  max-width: var(--chat-width, 768px);
  width: 100%;
}

/* Full-width scroll container */
.chat-section {
  display: flex;
  flex: 1;
  width: 100%;
  position: relative;
  justify-content: center;
  overflow-y: scroll;
  padding: 0 16px
}

/* Centered content column, no own scroll */
.chat-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: var(--chat-width, 768px);
  width: 100%;
  margin: 0 auto;
  overflow: visible;    /* or just omit overflow entirely */
}
</style>