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
  </div>
</template>

<script setup>
import { inject } from 'vue';
import { Icon } from '@iconify/vue';

const ui = inject('settings-ui', null);
</script>
