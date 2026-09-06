<template>
  <div>
    <div class="stx-header">
      <h2>Data</h2>
      <p>Back up or restore your conversations, notepad, and settings.</p>
    </div>

    <div class="stx-card">
      <div class="stx-item">
        <div class="stx-info">
          <h3>Export your data</h3>
          <p>Download a zip archive of your chats, notepad, and settings.</p>
        </div>
        <button class="stx-btn" @click="ui?.openExportMenu()">
          <Icon icon="material-symbols:download-rounded" width="18" height="18" />
          Export
        </button>
      </div>

      <div class="stx-item" style="border-bottom: none">
        <div class="stx-info">
          <h3>Import data</h3>
          <p>Restore from a Kira export or an OpenWebUI chat export.</p>
        </div>
        <button class="stx-btn" @click="ui?.openImportMenu()">
          <Icon icon="material-symbols:upload-rounded" width="18" height="18" />
          Import
        </button>
      </div>
    </div>

    <div class="stx-card">
      <div class="stx-item" style="border-bottom: none">
        <div class="stx-info">
          <h3>Delete all data</h3>
          <p>
            Permanently erases every chat, workspace file, notepad entry and
            setting on this device — and, if you are signed in, the copies
            stored on your account. Export first if you want a backup; this
            cannot be undone.
          </p>
          <p v-if="errors.length" class="delete-errors">
            Some data could not be removed: {{ errors.join("; ") }}
          </p>
        </div>
        <button class="stx-btn danger" :disabled="deleting" @click="handleDelete">
          <Icon icon="material-symbols:delete-forever-outline-rounded" width="18" height="18" />
          {{ deleting ? "Deleting…" : "Delete data" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue';
import { Icon } from '@iconify/vue';
import { deleteAllData } from '~/composables/deleteAllData';
import { confirmDialog } from '~/composables/useDialogs';

const ui = inject('settings-ui', null);

const deleting = ref(false);
const errors = ref([]);

async function handleDelete() {
  const ok = await confirmDialog({
    title: 'Delete all data',
    message:
      'This erases every conversation, workspace file, notepad entry and ' +
      'setting stored by Kira, including the copies on your account if you ' +
      'are signed in.\n\nThis cannot be undone.',
    confirmLabel: 'Delete everything',
    danger: true,
  });
  if (!ok) return;

  deleting.value = true;
  errors.value = [];
  try {
    const result = await deleteAllData();
    errors.value = result.errors;
    if (result.errors.length) return;

    // Hard reload rather than router.push: settings and the conversations
    // list are long-lived reactive state that would otherwise persist
    // themselves straight back into the store we just emptied.
    window.location.href = '/';
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.delete-errors {
  color: #dc2626;
}
</style>
