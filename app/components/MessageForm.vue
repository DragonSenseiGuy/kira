<script setup>
import { ref, computed, watch, nextTick, toRaw } from "vue";
import { Icon } from "@iconify/vue";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
} from "reka-ui";
import { useWindowSize, useMagicKeys } from "@vueuse/core";
import { useKeybinds } from "~/composables/useKeybinds";
import Logo from "./Logo.vue";
import ModelSelectorPopover from "./ModelSelectorPopover.vue";
import BottomSheetModelSelector from "./BottomSheetModelSelector.vue";
import { useAttachments } from "~/composables/useAttachments";
import DEFAULT_PARAMETERS from '~/composables/defaultParameters';
import { useDraftPrompt } from "~/composables/useDraftPrompt";
import { useWorkspaceBrowser } from "~/composables/useWorkspaceBrowser";
import {
  buildKnownPaths,
  backspaceTarget,
  deleteTarget,
  filterMentionFiles,
  findMentionSpans,
  resolveMentions,
  formatAttachedFiles,
  MENTION_TRIGGER_RE,
} from "~/utils/mentions";
import {
  findModelById,
  showReasoningToggle,
  showReasoningEffortSelector,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  formatReasoningLabel,
  isReasoningEnabled as checkReasoningEnabled,
  normalizeReasoningConfig,
  supportsToolUse,
} from "~/composables/availableModels";

// Define component properties and emitted events
const props = defineProps({
  isLoading: Boolean,
  selectedModelId: String, // Add selected model ID to determine if search is supported
  models: Array, // Full model catalog (Hack Club / OpenRouter) to check capabilities
  settingsManager: Object, // Add settings manager prop
  selectedModelName: String,
  conversationId: {
    type: String,
    default: ''
  },
});
const emit = defineEmits([
  "send-message",
  "abort-controller",
  "typing",
  "empty",
]);

const keys = useMagicKeys();

// Local state for reasoning effort
const reasoningEffort = ref();

// Local state for search enabled
const searchEnabled = ref(false);

// --- Reactive State ---
const inputMessage = ref("");
const textareaRef = ref(null); // Ref for the textarea element

// --- @file mentions (workspace file references) ---------------------------
const wb = useWorkspaceBrowser();
const mentionOpen = ref(false);
const mentionActive = ref(0);
const mirrorRef = ref(null); // highlight layer behind the textarea

// Paths that count as real references (chat files + attached projects).
const knownPaths = computed(() =>
  buildKnownPaths(wb.chatFiles.value, wb.projectFiles.value),
);

const mentionItems = computed(() => {
  if (!mentionOpen.value) return [];
  return filterMentionFiles(wb.chatFiles.value, wb.projectFiles.value, mentionQuery.value, 8);
});

// Keep the highlighted row valid as the list refilters.
watch(mentionItems, (list) => {
  if (mentionActive.value >= list.length) {
    mentionActive.value = Math.max(0, list.length - 1);
  }
});

// Reactive so the popover refilters on every keystroke (a plain variable
// here froze the list at whatever was visible when it opened).
const mentionQuery = ref("");
let mentionStart = -1;

function onMentionInput() {
  const el = textareaRef.value;
  if (!el) return;
  const caret = el.selectionStart ?? 0;
  const before = inputMessage.value.slice(0, caret);
  const match = MENTION_TRIGGER_RE.exec(before);
  if (!match || !wb.available.value) {
    if (mentionOpen.value) mentionClose();
    return;
  }
  mentionQuery.value = match[1] || "";
  mentionStart = caret - (match[1] || "").length;
  mentionActive.value = 0;
  mentionOpen.value = true;
}

function mentionMove(delta) {
  const n = mentionItems.value.length;
  if (!n) return;
  mentionActive.value = (mentionActive.value + delta + n) % n;
}

function pickMention(item) {
  const text = inputMessage.value;
  inputMessage.value =
    text.slice(0, mentionStart) + item.path + " " + text.slice(mentionStart + mentionQuery.value.length + 1);
  mentionClose();
  nextTick(() => textareaRef.value?.focus());
}

function mentionClose() {
  mentionOpen.value = false;
  mentionQuery.value = "";
}

// --- mention highlighting + atomic token editing ----------------------------
// Discord/Slack-style chips, emulated in a plain textarea: a mirror layer
// paints resolved @path tokens, and key handlers treat each token as one
// unit (Backspace/Delete remove it whole, arrows jump over it).

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const mentionSpans = computed(() =>
  findMentionSpans(inputMessage.value, knownPaths.value),
);

const mirrorHtml = computed(() => {
  const text = inputMessage.value || "";
  if (!text) return "";
  if (!mentionSpans.value.length) return escapeHtml(text);
  let out = "";
  let last = 0;
  for (const span of mentionSpans.value) {
    out += escapeHtml(text.slice(last, span.start));
    out += `<mark class="mention-token">@${escapeHtml(span.path)}</mark>`;
    last = span.end;
  }
  out += escapeHtml(text.slice(last));
  return out;
});

// --- IME composition (mobile keyboards) -------------------------------------
// Soft keyboards deliver every word as a composition session (autocorrect /
// predictive text): between compositionstart and compositionend the
// textarea's value changes while Vue's v-model deliberately ignores input
// events. Anything driven by `inputMessage` — the chip mirror AND the send
// button's disabled state — stayed stale until the word was committed with
// space/punctuation, which read as "typed words are invisible" and "the send
// button never lights up" on mobile. We therefore track the composition
// state, hide the mirror while composing (native text must stay visible),
// and sync straight from the DOM on every input event.

const isComposing = ref(false);

/**
 * The transparency/mirror layer may only paint when there are chips to
 * render AND the user isn't mid-composition — otherwise freshly typed words
 * would exist only in the (stale) mirror and be invisible.
 */
const mirrorVisible = computed(
  () => !isComposing.value && mentionSpans.value.length > 0,
);

function onCompositionStart() {
  isComposing.value = true;
}

function onCompositionEnd(event) {
  isComposing.value = false;
  syncFromElement(event?.target);
  onMentionInput();
}

/** Copies the textarea's live DOM value into reactive state (idempotent). */
function syncFromElement(el) {
  const value = el?.value;
  if (typeof value !== "string") return;
  if (value !== inputMessage.value) inputMessage.value = value;
}

function handleInput(event) {
  syncFromElement(event?.target);
  // Skip @-trigger detection mid-composition: picking a suggestion would
  // rewrite the text under the keyboard's feet.
  if (!isComposing.value) onMentionInput();
}

function syncMirror() {
  const el = textareaRef.value;
  const mirror = mirrorRef.value;
  if (el && mirror) {
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
  }
}

watch(mirrorHtml, () => nextTick(syncMirror));

function setCaret(pos) {
  nextTick(() => {
    const el = textareaRef.value;
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos);
    }
  });
}

/** Removes a token (and the single space terminating it) atomically. */
function removeSpan(span) {
  const text = inputMessage.value;
  let end = span.end;
  if (text[end] === " ") end += 1;
  inputMessage.value = text.slice(0, span.start) + text.slice(end);
  setCaret(span.start);
}

function onBackspace(e) {
  const el = textareaRef.value;
  if (!el || el.selectionStart !== el.selectionEnd) return;
  // Null at the chip's left edge → default runs → the character BEHIND the
  // chip is deleted, exactly like plain text.
  const span = backspaceTarget(mentionSpans.value, el.selectionStart);
  if (!span) return;
  e.preventDefault();
  removeSpan(span);
}

function onDeleteKey(e) {
  // TRAP: Vue's `.delete` key modifier is an alias for the BACKSPACE key
  // (runtime-dom keyNames: delete → 'backspace'), not the Delete key. Both
  // handlers fire on Backspace; this one must act only on a real Delete.
  if (e.key !== "Delete") return;
  const el = textareaRef.value;
  if (!el || el.selectionStart !== el.selectionEnd) return;
  const span = deleteTarget(mentionSpans.value, el.selectionStart);
  if (!span) return;
  e.preventDefault();
  removeSpan(span);
}

function onArrowLeft(e) {
  const el = textareaRef.value;
  if (!el || el.selectionStart !== el.selectionEnd) return;
  const caret = el.selectionStart;
  const span = mentionSpans.value.find((sp) => caret > sp.start && caret <= sp.end);
  if (!span) return;
  e.preventDefault();
  setCaret(span.start);
}

function onArrowRight(e) {
  const el = textareaRef.value;
  if (!el || el.selectionStart !== el.selectionEnd) return;
  const caret = el.selectionStart;
  const span = mentionSpans.value.find((sp) => caret >= sp.start && caret < sp.end);
  if (!span) return;
  e.preventDefault();
  setCaret(span.end);
}

function onTabSelect() {
  if (mentionOpen.value && mentionItems.value.length) {
    pickMention(mentionItems.value[mentionActive.value] || mentionItems.value[0]);
  }
}
const messageFormRoot = ref(null); // Ref for the root element
const fileInputRef = ref(null); // Ref for the hidden file input
const isDragging = ref(false); // Track drag state for visual feedback
const isProcessingFiles = ref(false); // Track file processing state for loading indicator
const isFocused = ref(false); // Track focus state for the textarea

// --- Draft Prompt Persistence ---
const conversationIdRef = computed(() => props.conversationId || '');
const { clearDraft } = useDraftPrompt(conversationIdRef, inputMessage);

// --- Attachments ---
const {
  attachments,
  error: attachmentError,
  hasAttachments,
  addFile,
  removeAttachment,
  clearAttachments,
  clearError: clearAttachmentError
} = useAttachments();

// Computed property to check if the input is empty (after trimming whitespace)
const trimmedMessage = computed(() => inputMessage.value.trim());

// Computed property to get the selected model object.
// Falls back to the provider-aware settings lookup so models from the
// full catalog or custom providers resolve their capabilities too.
const selectedModel = computed(() => {
  if (!props.selectedModelId) return null;

  const curated = props.models
    ? findModelById(props.models, props.selectedModelId)
    : null;
  if (curated) return curated;

  return props.settingsManager?.selectedModel || null;
});

// Computed property to check if the current model supports vision (image attachments)
const supportsVision = computed(() => {
  return selectedModel.value?.vision === true;
});

// Computed property for accepted file types based on model capabilities
// PDFs work with any model (via file-parser plugin), images require vision
const acceptedFileTypes = computed(() => {
  return supportsVision.value
    ? 'image/png,image/jpeg,image/webp,image/gif,.pdf,application/pdf'
    : '.pdf,application/pdf';
});

// Computed property to check if the current model supports reasoning
const supportsReasoning = computed(() => {
  if (!selectedModel.value) return false;
  const config = normalizeReasoningConfig(selectedModel.value);
  return config.supported;
});

// Computed property to check if the current model supports tool use
// (e.g., the Exa search and getPageContents tools). When false, the search
// toggle button should be hidden in the UI to avoid giving the user a control
// that has no effect (the server-side `tool_use: false` flag is already honored
// in message.js, but the UI was previously still showing the toggle).
const hasToolUseSupport = computed(() => {
  if (!selectedModel.value) return false;
  if (!supportsToolUse(selectedModel.value)) return false;
  // Search tools can be disabled entirely (Settings → Search & Tools).
  const source = props.settingsManager?.settings?.tool_search_source || 'hackclub';
  return source !== 'off';
});

// Computed property to check if the current model should show a reasoning toggle
const shouldShowReasoningToggle = computed(() => {
  if (!selectedModel.value) return false;
  return showReasoningToggle(selectedModel.value);
});

// Computed property to check if the current model should show effort selector
const shouldShowEffortSelector = computed(() => {
  if (!selectedModel.value) return false;
  return showReasoningEffortSelector(selectedModel.value);
});

// Computed property to get reasoning effort options for the current model
const reasoningEffortOptions = computed(() => {
  if (!selectedModel.value) return [];
  return getReasoningEffortOptions(selectedModel.value);
});

// Computed property to get the default reasoning effort for the current model
const defaultReasoningEffort = computed(() => {
  if (!selectedModel.value) return "default";
  return getDefaultReasoningEffort(selectedModel.value);
});


// Computed property to check if reasoning is currently enabled based on the model's configuration
const isReasoningEnabled = computed(() => {
  if (!selectedModel.value) return false;
  return checkReasoningEnabled(selectedModel.value, reasoningEffort.value);
});

// Computed property to check if search is currently enabled
const isSearchEnabled = computed({
  get: () => {
    // Get from settings manager if available, otherwise use local state
    if (props.settingsManager?.settings?.search_enabled !== undefined) {
      return props.settingsManager.settings.search_enabled;
    }
    return searchEnabled.value;
  },
  set: (value) => {
    searchEnabled.value = value;
    // Update settings manager if available
    if (props.settingsManager) {
      props.settingsManager.settings.search_enabled = value;
      props.settingsManager.saveSettings();
    }
  }
});

// Watch the selected model and load the appropriate reasoning effort setting
watch(
  () => [props.selectedModelId, props.settingsManager?.settings?.model_settings],
  ([newModelId]) => {
    if (newModelId && props.settingsManager) {
      const savedReasoningEffort = props.settingsManager.getModelSetting(newModelId, "reasoning_effort");
      if (savedReasoningEffort !== undefined) {
        reasoningEffort.value = savedReasoningEffort;
      } else if (defaultReasoningEffort.value) {
        reasoningEffort.value = defaultReasoningEffort.value;
      } else {
        reasoningEffort.value = "default";
      }
    }
  },
  { immediate: true }
);

// --- Mobile Model Selector Logic ---
const { width: windowWidth } = useWindowSize();
const isMobile = computed(() => windowWidth.value < 600);
const isBottomSheetOpen = ref(false);

const selectedModelLogo = computed(() => {
  if (!props.selectedModelId || !props.models) return null;
  const model = findModelById(props.models, props.selectedModelId);
  return model?.logo ?? null;
});

function openBottomSheet() {
  isBottomSheetOpen.value = true;
}

function closeBottomSheet() {
  isBottomSheetOpen.value = false;
}

function handleModelSelect(modelId, modelName) {
  if (props.settingsManager) {
    props.settingsManager.settings.selected_model_id = modelId;
    props.settingsManager.saveSettings();
  }
  closeBottomSheet();
}

// --- Event Handlers ---

watch(inputMessage, (newValue) => {
  if (newValue.trim()) {
    emit("typing");
  } else {
    emit("empty");
  }
});

/**
 * Handles the main action button click.
 * If loading, it aborts the request. Otherwise, it submits the message.
 */
function handleActionClick() {
  if (props.isLoading) {
    emit("abort-controller");
  } else if (trimmedMessage.value) {
    submitMessage();
  }
}

/**
 * Handles the Enter key press on the textarea.
 * On desktop (>= 768px), Enter submits the message.
 * On mobile, Enter creates a new line, as Shift+Enter is often unavailable.
 * @param {KeyboardEvent} event
 */
function handleEnterKey(event) {
  // @mention picker intercepts Enter to select the highlighted file.
  if (mentionOpen.value && mentionItems.value.length && !event.shiftKey) {
    event.preventDefault();
    pickMention(mentionItems.value[mentionActive.value] || mentionItems.value[0]);
    return;
  }
  if (typeof window !== 'undefined' && window.innerWidth >= 768 && !event.shiftKey) {
    event.preventDefault(); // Prevent default newline behavior on desktop
    if (!props.isLoading) {
      submitMessage();
    }
  }
  // On mobile or with Shift key, allow the default behavior (newline).
  // Prevent submission during loading
  if (props.isLoading && !event.shiftKey) {
    event.preventDefault();
  }
}

// --- Core Logic ---

/**
 * Emits the message to the parent, then clears the input.
 */
async function submitMessage() {
  // Resolve mentions: unescape literal \@ sequences, then ATTACH the
  // contents of every referenced workspace file. Read failures are skipped
  // — their @path stays in the text so the model can retry via its tools.
  const { cleanText, mentions } = resolveMentions(inputMessage.value, knownPaths.value);
  let outgoing = cleanText;
  if (mentions.length && wb.available.value) {
    const entries = await Promise.all(
      mentions.map(async (path) => {
        try {
          return { path, content: await wb.readEntryText(path) };
        } catch {
          return { path, content: null };
        }
      }),
    );
    const blocks = formatAttachedFiles(entries);
    if (blocks) outgoing = `${cleanText}\n\n${blocks}`;
  }
  // Emit the message to parent component, including search enabled state
  emit("send-message", outgoing, outgoing, toRaw(attachments.value), isSearchEnabled.value);
  inputMessage.value = "";
  // Clear draft for this conversation
  await clearDraft();
  // Clear attachments after sending
  clearAttachments();
  // Force textarea resize after clearing
  await nextTick();
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
}

/**
 * Watches the input message to automatically resize the textarea.
 */
watch(inputMessage, async () => {
  // Wait for the DOM to update before calculating the new height

  await nextTick();
  if (textareaRef.value) {
    // Temporarily set height to 'auto' to correctly calculate the new scrollHeight

    textareaRef.value.style.height = "auto";
    // Set the height to match the content, up to the max-height defined in CSS

    // If the content is empty, let CSS handle the min-height

    if (inputMessage.value !== "") {
      textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
    }
  }
});

// --- Exposed Methods ---

/**
 * Allows the parent component to programmatically set the input message.
 * @param {string} text - The message to set in the textarea.
 */
function setMessage(text) {
  inputMessage.value = text;
}


/**
 * Toggles the reasoning state and updates the settings.
 * For models with an effort selector, cycles through the available options
 * (including "none" / Off when the model is toggleable). For simple toggleable
 * models, switches between the generic on state ("default") and off ("none").
 */
function toggleReasoning() {
  if (shouldShowEffortSelector.value) {
    // For models with reasoning effort options, cycle through them
    const currentIndex = reasoningEffortOptions.value.indexOf(reasoningEffort.value);
    const nextIndex = (currentIndex + 1) % reasoningEffortOptions.value.length;
    reasoningEffort.value = reasoningEffortOptions.value[nextIndex];
  } else {
    // For simple toggleable models, toggle between on ("default") and off ("none")
    reasoningEffort.value = reasoningEffort.value === "default" ? "none" : "default";
  }

  // Update the setting in the settings manager
  if (props.settingsManager && props.selectedModelId) {
    props.settingsManager.setModelSetting(props.selectedModelId, "reasoning_effort", reasoningEffort.value);
    props.settingsManager.saveSettings();
  }
}

/**
 * Toggles the search state.
 *
 * Defensive guard: if the current model doesn't support tool use, the search
 * button is hidden in the UI, but this function is also exposed via
 * `defineExpose` and can be invoked programmatically. Refuse to enable search
 * in that case so a stale setting can never be turned back on for a model
 * that won't honor it.
 */
function toggleSearch() {
  if (!hasToolUseSupport.value) return;
  isSearchEnabled.value = !isSearchEnabled.value;
}

/**
 * Sets the reasoning effort for GPT-OSS models and updates the settings
 * @param {string} value - The selected reasoning effort value
 */
function setReasoningEffort(value) {
  reasoningEffort.value = value;
  // Update the setting in the settings manager
  if (props.settingsManager && props.selectedModelId) {
    props.settingsManager.setModelSetting(props.selectedModelId, "reasoning_effort", value);
    props.settingsManager.saveSettings();
  }
}

// --- Attachment Handlers ---

/**
 * Opens the file picker dialog
 */
function openFilePicker() {
  fileInputRef.value?.click();
}

/**
 * Handles file selection from the file input
 * @param {Event} event - The change event from file input
 */
async function handleFileSelect(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    await addFile(file, supportsVision.value);
  }
  // Reset input to allow selecting the same file again
  event.target.value = '';
}

/**
 * Checks if a file is an allowed type (image or PDF)
 * @param {File} file - The file to check
 * @returns {boolean}
 */
function isAllowedFileType(file) {
  const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  const pdfTypes = ['application/pdf'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  // PDFs are always allowed
  if (pdfTypes.includes(file.type) || extension === 'pdf') {
    return true;
  }
  
  // Images require vision support
  if (imageTypes.includes(file.type) || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
    return supportsVision.value;
  }
  
  return false;
}

/**
 * Handles paste event to support pasting images/PDFs from clipboard
 * @param {ClipboardEvent} event - The paste event
 */
async function handlePaste(event) {
  if (props.isLoading) return;
  
  const items = event.clipboardData?.items;
  if (!items) return;
  
  const filesToAdd = [];
  
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file && isAllowedFileType(file)) {
        filesToAdd.push(file);
      }
    }
  }
  
  // Only prevent default if we found files to add
  if (filesToAdd.length > 0) {
    event.preventDefault();
    isProcessingFiles.value = true;
    try {
      for (const file of filesToAdd) {
        await addFile(file, supportsVision.value);
      }
    } finally {
      isProcessingFiles.value = false;
    }
  }
}

/**
 * Handles dragenter event
 * @param {DragEvent} event - The drag event
 */
function handleDragEnter(event) {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = true;
}

/**
 * Handles dragover event
 * @param {DragEvent} event - The drag event
 */
function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = true;
}

/**
 * Handles dragleave event
 * @param {DragEvent} event - The drag event
 */
function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Only set isDragging to false if we're leaving the container entirely
  // Check if the related target is outside our drop zone
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX;
  const y = event.clientY;
  
  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
    isDragging.value = false;
  }
}

/**
 * Handles drop event for drag-and-drop file uploads
 * @param {DragEvent} event - The drop event
 */
async function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = false;
  
  if (props.isLoading) return;
  
  const files = Array.from(event.dataTransfer?.files || []);
  const filesToAdd = files.filter(file => isAllowedFileType(file));
  
  if (filesToAdd.length > 0) {
    isProcessingFiles.value = true;
    try {
      for (const file of filesToAdd) {
        await addFile(file, supportsVision.value);
      }
    } finally {
      isProcessingFiles.value = false;
    }
  }
}

// Focus text input via the user-configured shortcut (Settings → Shortcuts).
// The dispatcher already skips modifier-less binds while typing, which
// preserves the original "only when not focused" behavior.
useKeybinds({
  focus_input: () => {
    textareaRef.value?.focus();
  },
});

// Expose the setMessage function to be called from the parent component
defineExpose({ setMessage, toggleReasoning, setReasoningEffort, toggleSearch, $el: messageFormRoot });
</script>

<template>
  <div ref="messageFormRoot" class="input-section">
    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      :accept="acceptedFileTypes"
      multiple
      class="hidden-file-input"
      @change="handleFileSelect"
    />

    <div 
      class="input-area-wrapper"
      :class="{ 'drag-over': isDragging }"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- Attachment error message -->
      <div v-if="attachmentError" class="attachment-error u-enter" role="alert">
        <Icon icon="material-symbols:error-outline" width="16" height="16" />
        <span>{{ attachmentError }}</span>
        <UiIconButton
          icon="material-symbols:close"
          label="Dismiss error"
          size="sm"
          class="dismiss-error"
          @click="clearAttachmentError"
        />
      </div>

      <!-- Attachment previews -->
      <div v-if="hasAttachments || isProcessingFiles" class="attachment-preview-row">
        <!-- Processing indicator -->
        <div v-if="isProcessingFiles" class="attachment-preview processing">
          <UiSpinner :size="18" label="Processing attachments" />
          <span class="attachment-name">Processing...</span>
        </div>
        <div
          v-for="attachment in attachments"
          :key="attachment.id"
          class="attachment-preview"
          :class="attachment.type"
        >
          <img v-if="attachment.type === 'image'" :src="attachment.dataUrl" :alt="attachment.filename" />
          <Icon v-else icon="material-symbols:picture-as-pdf" width="24" height="24" class="pdf-icon" />
          <span class="attachment-name">{{ attachment.filename }}</span>
          <button class="remove-attachment" @click="removeAttachment(attachment.id)" aria-label="Remove attachment">
            <Icon icon="material-symbols:close" width="14" height="14" />
          </button>
        </div>
      </div>

      <div class="textarea-stack">
        <!-- @file mention picker: anchored to the typing line (Discord/Slack
             style) — above the textarea, below any attachment previews. -->
        <div v-if="mentionOpen && mentionItems.length" class="mention-pop" role="listbox">
          <button
            v-for="(item, i) in mentionItems"
            :key="item.path"
            type="button"
            class="mention-item"
            :class="{ active: i === mentionActive }"
            role="option"
            :aria-selected="i === mentionActive"
            @mousedown.prevent="pickMention(item)"
          >
            <Icon icon="material-symbols:draft-outline-rounded" width="14" height="14" />
            <span>{{ item.path }}</span>
          </button>
        </div>
        <!-- Highlight mirror: renders the same text with @mentions painted;
             the textarea above it shows transparent text + caret. Suppressed
             during IME composition so freshly composed words stay visible. -->
        <div v-if="mirrorVisible" ref="mirrorRef" class="chat-mirror" aria-hidden="true" v-html="mirrorHtml"></div>
        <textarea
          ref="textareaRef"
          v-model="inputMessage"
          :disabled="isLoading"
          :class="{ 'text-hidden': mirrorVisible }"
          @keydown.enter="handleEnterKey"
          @keydown.down.prevent="mentionActive >= 0 && mentionMove(1)"
          @keydown.up.prevent="mentionActive >= 0 && mentionMove(-1)"
          @keydown.esc="mentionClose"
          @keydown.backspace="onBackspace"
          @keydown.delete="onDeleteKey"
          @keydown.left="onArrowLeft"
          @keydown.right="onArrowRight"
          @keydown.tab.prevent="onTabSelect"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
          @input="handleInput"
          @scroll="syncMirror"
          @paste="handlePaste"
          @focus="isFocused = true"
          @blur="isFocused = false"
          placeholder="Type your message..."
          class="chat-textarea"
          rows="1"
        ></textarea>
      </div>

      <div class="input-actions">
        <!-- Plus button popover menu - contains toggles and attach media -->
        <PopoverRoot>
          <PopoverTrigger as-child>
            <UiIconButton
              icon="material-symbols:add"
              label="Open attachment menu"
              variant="subtle"
              class="attachment-btn"
              :disabled="isLoading"
            />
          </PopoverTrigger>
          <PopoverContent 
            class="popover-dropdown attachment-popover" 
            side="top" 
            align="start"
            :side-offset="8"
          >
            <!-- Mobile: Search toggle -->
            <button
              v-if="isMobile && selectedModel && hasToolUseSupport"
              type="button"
              class="popover-toggle-item"
              :class="{ 'toggle-enabled': isSearchEnabled }"
              @click="toggleSearch"
            >
              <Icon icon="material-symbols:globe" width="20" height="20" />
              <span class="toggle-label">Search</span>
              <Icon 
                v-if="isSearchEnabled" 
                icon="material-symbols:check" 
                width="18" 
                height="18" 
                class="toggle-status"
              />
            </button>

            <!-- Mobile: Reasoning toggle (simple on/off) for toggleable models without effort levels -->
            <button
              v-if="isMobile && selectedModel && shouldShowReasoningToggle && !shouldShowEffortSelector && supportsReasoning"
              type="button"
              class="popover-toggle-item"
              :class="{ 'toggle-enabled': isReasoningEnabled }"
              @click="toggleReasoning"
            >
              <Icon icon="tabler:brain" width="20" height="20" />
              <span class="toggle-label">Reasoning</span>
              <Icon
                v-if="isReasoningEnabled"
                icon="material-symbols:check"
                width="18"
                height="18"
                class="toggle-status"
              />
            </button>

            <!-- Mobile: Reasoning effort submenu (for models with effort options) -->
            <!-- When the model is also toggleable, "Off" (none) is included as the first option. -->
            <DropdownMenuRoot v-if="isMobile && selectedModel && shouldShowEffortSelector">
              <DropdownMenuTrigger class="popover-toggle-item reasoning-submenu-trigger">
                <Icon icon="tabler:brain" width="20" height="20" />
                <span class="toggle-label">{{ formatReasoningLabel(reasoningEffort) }}</span>
                <Icon icon="material-symbols:chevron-right" width="18" height="18" class="submenu-arrow" />
              </DropdownMenuTrigger>

              <DropdownMenuContent class="popover-dropdown reasoning-effort-dropdown" side="right" align="start"
                :side-offset="8">
                <div class="dropdown-scroll-container">
                  <DropdownMenuItem
                    v-for="option in reasoningEffortOptions"
                    :key="option"
                    class="reasoning-effort-item"
                    :class="{ selected: option === reasoningEffort }"
                    @click="() => setReasoningEffort(option)"
                  >
                    <span>{{ formatReasoningLabel(option) }}</span>
                    <Icon
                      v-if="option === reasoningEffort"
                      icon="material-symbols:check"
                      width="16"
                      height="16"
                    />
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenuRoot>

            <!-- Divider (mobile only, when there are reasoning controls) -->
            <div v-if="isMobile && supportsReasoning" class="popover-divider"></div>

            <!-- Attach media button (both mobile and desktop) -->
            <button
              type="button"
              class="popover-attach-btn"
              @click="openFilePicker"
            >
              <Icon icon="material-symbols:attach-file" width="20" height="20" />
              <span>Attach {{ supportsVision ? 'image or PDF' : 'PDF' }}</span>
            </button>
          </PopoverContent>
        </PopoverRoot>

        <!-- Desktop: Search toggle button -->
        <UiButton
          v-if="!isMobile && selectedModel && hasToolUseSupport"
          class="feature-button"
          :variant="isSearchEnabled ? 'primary' : 'secondary'"
          icon="material-symbols:globe"
          :aria-pressed="String(isSearchEnabled)"
          :aria-label="isSearchEnabled ? 'Disable search' : 'Enable search'"
          @click="toggleSearch"
        >
          Search
        </UiButton>

        <!-- Desktop: Reasoning toggle for models that are toggleable but have no effort levels -->
        <UiButton
          v-if="!isMobile && selectedModel && shouldShowReasoningToggle && !shouldShowEffortSelector && supportsReasoning"
          class="feature-button"
          :variant="isReasoningEnabled ? 'primary' : 'secondary'"
          icon="tabler:brain"
          :aria-pressed="String(isReasoningEnabled)"
          :aria-label="isReasoningEnabled ? 'Disable reasoning' : 'Enable reasoning'"
          @click="toggleReasoning"
        >
          Reasoning
        </UiButton>

        <!-- Desktop: Reasoning effort dropdown for models that support reasoning effort -->
        <!-- When the model is also toggleable, "Off" (none) is included as the first option. -->
        <DropdownMenuRoot v-if="!isMobile && selectedModel && shouldShowEffortSelector">
          <DropdownMenuTrigger as-child>
            <UiButton
              class="feature-button"
              :variant="reasoningEffort === 'none' ? 'secondary' : 'primary'"
              icon="material-symbols:lightbulb"
            >
              {{ formatReasoningLabel(reasoningEffort) }}
            </UiButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent class="popover-dropdown reasoning-effort-dropdown" side="top" align="center"
            :side-offset="8">
            <div class="dropdown-scroll-container">
              <DropdownMenuItem v-for="option in reasoningEffortOptions" :key="option" class="reasoning-effort-item"
                :class="{ selected: option === reasoningEffort }" @click="() => setReasoningEffort(option)">
                <span>{{ formatReasoningLabel(option) }}</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenuRoot>

        <!-- Right aligned actions -->
        <div class="right-actions">
          <!-- Model Selector Popover (all screen sizes) -->
          <ModelSelectorPopover
            :selected-model-id="props.selectedModelId"
            :selected-model-name="props.selectedModelName"
            @model-selected="handleModelSelect"
          />

          <UiIconButton
            class="send-btn"
            variant="solid"
            :icon="isLoading ? 'material-symbols:stop-rounded' : 'material-symbols:arrow-upward-rounded'"
            :label="isLoading ? 'Stop generation' : 'Send message'"
            :disabled="!trimmedMessage && !isLoading"
            @click="handleActionClick"
          />
        </div>
      </div>
    </div>
  </div>

  <BottomSheetModelSelector
    v-if="isMobile"
    :is-open="isBottomSheetOpen"
    :selected-model-id="props.selectedModelId"
    :selected-model-name="props.selectedModelName"
    @close="closeBottomSheet"
    @model-selected="handleModelSelect"
  />
</template>

<style scoped>
/* --- LAYOUT & STRUCTURE --- */
.input-section {
  /* Stick to the bottom of the scroll container (chat-column) */
  position: sticky;
  background: var(--bg);
  border-radius: 0;
  bottom: 0px;
  width: 100%;
  padding: 0;
  box-sizing: border-box;
  z-index: 10;
  box-shadow: 0 -12px 18px 10px var(--bg);
}

.input-area-wrapper {
  display: flex;
  margin-bottom: 8px;
  flex-direction: column;
  background-color: var(--card);
  border: none;
  border-radius: var(--radius-xl);
  padding: 4px 8px 8px;
  box-shadow: var(--shadow-raised);
  position: relative;
  z-index: 10;
  transition: box-shadow var(--duration) var(--ease-out),
    background-color var(--duration) var(--ease-out);
}

.input-area-wrapper:focus-within {
  box-shadow:
    0 0 0 1px var(--accent),
    0 0 0 4px var(--focus-ring),
    0 2px 10px #0000000b;
}

.input-area-wrapper.drag-over {
  box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px var(--focus-ring);
  background-color: var(--accent-tint);
}

.chat-textarea {
  display: block;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  resize: none;
  color: var(--text-primary);
  /* Form controls don't inherit the page font by default — without this
     the highlight mirror (which DOES inherit) misaligns per-glyph. */
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.5;
  min-height: 24px;
  max-height: 250px;
  overflow-y: auto;
  position: relative;
  caret-color: var(--text-primary);
}

/* When the highlight mirror is showing, the textarea's own text goes
   transparent so tokens aren't double-drawn; caret + selection still work. */
.chat-textarea.text-hidden {
  color: transparent;
}

/* Mirror layer: identical box metrics to the textarea so glyphs align. */
.textarea-stack {
  position: relative;
}
.chat-mirror {
  position: absolute;
  inset: 0;
  padding: 10px 12px;
  font-size: 1rem;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
/* v-html content doesn't receive the scoped-style attribute, so this must
   be :deep() — otherwise the browser's default yellow <mark> shows through.
   Metric-safe by design (no padding/border/font-weight changes, or the
   mirror's glyphs drift off the textarea's), and deliberately quiet: at
   inline-text sizes a soft tint reads better than a badge. */
.chat-mirror :deep(.mention-token) {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
  border-radius: 4px;
}
.chat-textarea:focus {
  outline: none;
}

/* --- BUTTONS ---
   Sizing and states come from UiButton / UiIconButton; the composer only
   pins the send button's disabled treatment, which is specific to it. */
.send-btn:disabled {
  background-color: var(--btn-send-disabled-bg);
  color: var(--text-muted);
  box-shadow: none;
}

.feature-button {
  flex-shrink: 0;
}

.input-actions {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 8px 0 0;
  gap: 6px;
  width: 100%;
}

/* No special casing for sidebars needed – the parent layout
   (chat-column) controls horizontal alignment and width. */

/* Reasoning effort dropdown — the popIn keyframes and overlay recipe live in
   base.css so every menu in the app enters identically. */
.reasoning-effort-dropdown {
  animation: popIn var(--duration) var(--ease-out-strong) forwards;
  min-width: 200px;
  background: var(--popover-bg);
  border-radius: var(--radius-card);
  padding: 5px;
  box-shadow: var(--popover-shadow);
  z-index: 1001;
}

.reasoning-effort-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 9px;
  text-align: left;
  background: none;
  color: var(--popover-list-item-text);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
  font-size: 0.85rem;
  border-radius: var(--radius-chip);
  margin-bottom: 1px;
  border: none;
}

.reasoning-effort-item:hover {
  background-color: var(--popover-list-item-bg-hover);
}

.reasoning-effort-item.selected {
  background-color: var(--popover-list-item-selected-bg);
  color: var(--popover-list-item-selected-text);
  font-weight: 500;
}

/* Mobile-specific styles */
@media (max-width: 768px) {
  .input-section {
    max-width: 100%;
    padding: 8px 10px 0;
  }
  
  .chat-textarea {
    font-size: 16px; /* Prevent zoom on iOS */
  }
}

.logo-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.model-name-truncate {
  max-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-selector-mobile-btn {
  padding: 4px 8px;
  gap: 4px;
}

.right-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* --- ATTACHMENTS --- */
.hidden-file-input {
  display: none;
}

.attachment-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 12px;
  margin-bottom: 8px;
  background-color: var(--error-bg);
  box-shadow: 0 0 0 1px var(--error-border);
  border-radius: var(--radius-control);
  color: var(--error-text);
  font-size: 0.82rem;
}

.attachment-error span {
  flex: 1;
}

.dismiss-error {
  color: inherit;
}

.attachment-preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.attachment-preview {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background-color: var(--bg-secondary);
  box-shadow: var(--shadow-hairline);
  border-radius: var(--radius-control);
  max-width: 200px;
  animation: uEnter var(--duration-enter) var(--ease-out-strong) both;
}

.attachment-preview.image {
  padding: 4px;
}

.attachment-preview.image img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--radius-chip);
}

.attachment-preview.pdf {
  padding-right: 28px;
}

.attachment-preview .pdf-icon {
  color: var(--error-text);
  flex-shrink: 0;
}

.attachment-name {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.attachment-preview.image .attachment-name {
  display: none;
}

.remove-attachment {
  position: absolute;
  padding: 0;
  top: -6px;
  right: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background-color: var(--bg);
  box-shadow: var(--shadow-hairline);
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  color: var(--text-secondary);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.remove-attachment:hover {
  background-color: var(--error-bg);
  box-shadow: 0 0 0 1px var(--error-border);
  color: var(--error-text);
}

/* Processing indicator styles */
.attachment-preview.processing {
  background-color: var(--bg-secondary);
  color: var(--primary);
}

/* Attachment popover styles */
.attachment-popover {
  min-width: 200px;
  padding: 8px;
}

.popover-toggle-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.popover-toggle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-size: 0.88em;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.popover-toggle-item:hover {
  background: var(--btn-hover);
}

.popover-toggle-item.toggle-enabled {
  color: var(--primary);
}

.popover-toggle-item.toggle-enabled:hover {
  background: var(--btn-hover);
}

.toggle-label {
  flex: 1;
  text-align: left;
}

.toggle-status {
  flex-shrink: 0;
  color: var(--primary);
}

.popover-divider {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
}

.popover-attach-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-size: 0.88em;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.popover-attach-btn:hover {
  background: var(--btn-hover);
}

.popover-toggle-item.reasoning-submenu-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-size: 0.88em;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.popover-toggle-item.reasoning-submenu-trigger:hover {
  background: var(--btn-hover);
}

.submenu-arrow {
  margin-left: auto;
  color: var(--text-muted);
}

/* Mobile reasoning effort dropdown - match toggle styles */
.attachment-popover .reasoning-effort-dropdown .reasoning-effort-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-size: 0.88em;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.attachment-popover .reasoning-effort-dropdown .reasoning-effort-item:hover {
  background: var(--btn-hover);
}

.attachment-popover .reasoning-effort-dropdown .reasoning-effort-item.selected {
  background: transparent;
  color: var(--primary);
  font-weight: 500;
}

.attachment-popover .reasoning-effort-dropdown .reasoning-effort-item.selected:hover {
  background: var(--btn-hover);
}
</style>

<style scoped>
.mention-pop {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 260px;
  max-width: 380px;
  background: var(--bg-elevated, var(--bg-primary, #fff));
  border: 1px solid var(--border, rgba(128,128,128,.3));
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18);
  padding: 4px;
  z-index: 50;
}
.mention-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 7px;
  font-size: .78rem;
  text-align: left;
}
.mention-item.active,
.mention-item:hover {
  background: var(--bg-secondary, rgba(128,128,128,.12));
}
</style>
