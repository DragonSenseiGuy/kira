<script setup>
import { ref, useId } from "vue";
import { Icon } from "@iconify/vue";

defineProps({
  // From messageSources(): { url, title, domain, cited }
  sources: { type: Array, required: true },
});

const open = ref(false);
const listId = useId();
</script>

<template>
  <div v-if="sources.length" class="message-sources">
    <button
      type="button"
      class="sources-toggle"
      :aria-expanded="open"
      :aria-controls="listId"
      @click="open = !open"
    >
      <Icon icon="material-symbols:language" width="16" height="16" />
      <span>Sources</span>
      <span class="sources-count">{{ sources.length }}</span>
      <Icon
        :icon="open ? 'material-symbols:keyboard-arrow-up-rounded' : 'material-symbols:keyboard-arrow-down-rounded'"
        width="16"
        height="16"
      />
    </button>
    <ol v-show="open" :id="listId" class="sources-list">
      <li v-for="source in sources" :key="source.url">
        <a :href="source.url" target="_blank" rel="noopener noreferrer" class="source-link">
          <span class="source-title">{{ source.title }}</span>
          <span class="source-meta">
            {{ source.domain }}<template v-if="source.cited"> · linked in the answer</template>
          </span>
        </a>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.message-sources {
  margin: 8px 0 4px;
}

.sources-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.sources-toggle:hover,
.sources-toggle[aria-expanded="true"] {
  color: var(--text-primary);
  background: var(--btn-hover);
}

.sources-toggle:focus-visible,
.source-link:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.sources-count {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.sources-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 2px;
}

.source-link {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.source-link:hover {
  background: var(--btn-hover);
}

.source-title {
  color: var(--text-primary);
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-meta {
  color: var(--text-muted);
  font-size: 0.8rem;
}
</style>
