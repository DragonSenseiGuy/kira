<template>
  <div class="chat-section">
    <div class="chat-column">
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
      <div v-if="missingDeepLink" class="deep-link-warning" role="status">
        That message is no longer in this conversation.
      </div>
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
// This page is for displaying a specific conversation by ID
import { ref, nextTick, onMounted, computed } from 'vue';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/github-dark.css';
import { useDark } from "@vueuse/core";
import { useRoute } from '#app';
import { useHead } from '@unhead/vue';

import { hcFullModels } from '~/composables/providers';
import { useSettings } from '~/composables/useSettings';
import { useConversation } from '~/composables/useConversation';
import { useGlobalScrollStatus } from '~/composables/useGlobalScrollStatus';

import ChatPanel from '~/components/ChatPanel.vue';
import ContextCompressionChip from '~/components/ContextCompressionChip.vue';

// Get the route and conversation ID
const route = useRoute();
const conversationId = route.params.id;

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
  sendMessage,
  editUserMessage,
  regenerateAssistantMessage,
  navigateBranch,
  changeConversation,
  deleteConversation,
  newConversation,
  toggleIncognito,
  revealMessage,
  setChatPanel,
  chatPanel // This is the chat panel ref from the composable
} = useConversation();

const messageFormRef = ref(null); // Reference to the MessageForm component
const chatPanelRef = ref(null); // Reference to the ChatPanel component

// Shown when a `?m=` deep link points at a message that no longer exists.
const missingDeepLink = ref(false);

// Use global scroll status instead of local ref
const { setIsScrolledTop } = useGlobalScrollStatus();

/**
 * Handles a `?m=<messageId>` deep link: switches to the branch containing the
 * message, then scrolls to and highlights it.
 *
 * @param {*} messageId - The raw query value.
 */
async function handleDeepLink(messageId) {
  missingDeepLink.value = false;
  if (!messageId || typeof messageId !== 'string') return;

  // The conversation may still be loading when the route resolves.
  if (chatLoading.value) {
    await new Promise(resolve => {
      const stop = watch(chatLoading, loading => {
        if (!loading) {
          stop();
          resolve();
        }
      });
    });
  }

  const revealed = await revealMessage(messageId);
  if (!revealed) {
    missingDeepLink.value = true;
    return;
  }

  const focused = await chatPanelRef.value?.focusMessage(messageId);
  if (!focused) missingDeepLink.value = true;
}

// React to deep links on first load and on subsequent in-page navigations.
watch(
  () => [route.params.id, route.query.m],
  ([, messageId]) => {
    if (messageId) handleDeepLink(messageId);
    else missingDeepLink.value = false;
  },
);

onMounted(async () => {
  await settingsManager.loadSettings();
  // No manual default setting needed here as Settings class handles it now


  // Set the chat panel reference (used by useConversation for scrollToEnd, etc.)
  setChatPanel(chatPanelRef.value);

  // The conversation loading is now handled by the useConversation composable
  
  // Check if this is a newly created conversation that needs an AI response
  // (i.e., it has a user message but no assistant response yet)
  await nextTick();
  if (messages.value.length === 1 && messages.value[0].role === 'user') {
    // This is a new conversation with only the initial user message
    // Automatically trigger the AI response using sendMessage with skipUserMessage
    // since the user message was already added by createNewConversationWithMessage
    const userMessage = messages.value[0].content;
    const userAttachments = messages.value[0].attachments || [];
    // Get search enabled setting
    const searchEnabled = settingsManager.settings?.search_enabled ?? false;
    await sendMessage(userMessage, null, userAttachments, searchEnabled, { skipUserMessage: true });
  }

  // Honour a `?m=` deep link on first load (the watcher only covers later
  // navigations, since it is not immediate).
  if (route.query.m) await handleDeepLink(route.query.m);
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
  title: () => `${conversationTitle.value || 'Conversation'} - Kira`,
  meta: [
    { name: 'description', content: 'Chat conversation with the AI assistant' }
  ]
});
</script>

<style scoped>
/* Full-width scroll container */
.chat-section {
  display: flex;
  flex: 1;
  width: 100%;
  position: relative;
  justify-content: center;
  overflow-y: scroll;
  padding: 0 16px;
}

.deep-link-warning {
  align-self: center;
  margin: 8px 0 16px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* Centered content column, no own scroll */
.chat-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  max-width: var(--chat-width);
  width: 100%;
  margin-bottom: 90px;
  margin: 0 auto;
  overflow: visible;    /* or just omit overflow entirely */
}
</style>