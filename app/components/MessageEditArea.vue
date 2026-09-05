<template>
  <div class="edit-area-inner">
    <!-- Editable attachments -->
    <div v-if="attachments.length > 0" class="edit-attachments">
      <div
        v-for="(attachment, index) in attachments"
        :key="attachment.id"
        class="edit-attachment-item"
        :class="attachment.type"
      >
        <img
          v-if="attachment.type === 'image'"
          :src="attachment.dataUrl"
          :alt="attachment.filename"
        />
        <div v-else class="edit-pdf-item">
          <Icon icon="material-symbols:picture-as-pdf" width="20" height="20" />
          <span class="edit-pdf-filename">{{ attachment.filename }}</span>
        </div>
        <button class="remove-attachment-btn" @click="removeAttachment(index)" title="Remove attachment">
          <Icon icon="material-symbols:close-rounded" width="16px" height="16px" />
        </button>
      </div>
    </div>
    <textarea
      ref="textareaRef"
      v-model="content"
      class="edit-textarea"
      placeholder="Edit your message..."
      rows="1"
      @keydown.enter="handleEnterKey"
      @keydown.esc="$emit('cancel')"
    ></textarea>
    <div class="edit-actions">
      <button class="edit-cancel" @click="$emit('cancel')">
        <Icon icon="material-symbols:close-rounded" width="16px" height="16px" />
        <span>Cancel</span>
      </button>
      <button class="edit-save" @click="submit">
        <Icon icon="material-symbols:check-rounded" width="16px" height="16px" />
        <span>Save & Submit</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import { Icon } from '@iconify/vue';

/**
 * Self-contained inline editor for a user message: editable text plus
 * removable attachments. Owns its draft state so the parent only needs
 * to react to `submit` / `cancel`.
 */
const props = defineProps({
  message: { type: Object, required: true }
});

const emit = defineEmits(['submit', 'cancel']);

const content = ref(props.message?.content || '');
const attachments = ref(props.message?.attachments ? [...props.message.attachments] : []);
const textareaRef = ref(null);

function resizeTextarea() {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto';
      if (content.value !== '') {
        textareaRef.value.style.height = `${textareaRef.value.scrollHeight}px`;
      }
    }
  });
}

onMounted(resizeTextarea);
watch(content, resizeTextarea);

/**
 * On desktop, plain Enter submits; Shift+Enter or mobile Enter inserts a newline.
 */
function handleEnterKey(event) {
  if (typeof window !== 'undefined' && window.innerWidth >= 768 && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

function removeAttachment(index) {
  attachments.value.splice(index, 1);
}

function submit() {
  if (content.value.trim() === '' && attachments.value.length === 0) return;
  emit('submit', content.value, [...attachments.value]);
}
</script>
