<script setup>
/**
 * Command palette (⌘K / Ctrl+K).
 *
 * One input that spans three things Kira otherwise makes you hunt for:
 * app commands, conversations by title, and — the reason this exists — the
 * text inside past messages. Selecting a message result deep-links to it.
 *
 * All ordering/sectioning logic lives in `composables/commandPalette.js`;
 * this component is the shell around it.
 */
import { ref, computed, watch, nextTick } from "vue";
import { Icon } from "@iconify/vue";
import { useRouter } from "vue-router";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  VisuallyHidden,
} from "reka-ui";
import { useConversationsList } from "~/composables/useConversationsList";
import { useMessageSearch } from "~/composables/useMessageSearch";
import { buildPaletteItems, moveActiveIndex, clampActiveIndex } from "~/composables/commandPalette";
import { snippetSegments } from "~/composables/messageSearch";
import { highlightSegments } from "~/utils/fuzzyMatch";
import { relativeTime } from "~/utils/relativeTime";

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  /** `{ id, label, hint, icon, keywords, run }` — supplied by the layout. */
  commands: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:open"]);

const router = useRouter();
const { metadata } = useConversationsList();
const { results: messageResults, isSearching, search, clear } = useMessageSearch();

const query = ref("");
const activeIndex = ref(0);
const inputRef = ref(null);
const listRef = ref(null);

const palette = computed(() =>
  buildPaletteItems({
    commands: props.commands,
    conversations: metadata.value,
    messageResults: messageResults.value,
    query: query.value,
  }),
);

const rows = computed(() => palette.value.flat);
const activeKey = computed(() => rows.value[activeIndex.value]?.key ?? null);

const showEmptyState = computed(
  () => rows.value.length === 0 && !isSearching.value,
);

watch(query, (value) => {
  search(value.replace(/^[>@#]/, ""));
  activeIndex.value = 0;
});

// A late-arriving message search can grow the list under the cursor.
watch(rows, (list) => {
  activeIndex.value = clampActiveIndex(activeIndex.value, list.length);
});

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      query.value = "";
      activeIndex.value = 0;
      clear();
      await nextTick();
      inputRef.value?.focus();
    } else {
      clear();
    }
  },
);

function close() {
  emit("update:open", false);
}

/** Scrolls the keyboard cursor back into view after arrow navigation. */
async function scrollActiveIntoView() {
  await nextTick();
  const element = listRef.value?.querySelector("[data-active='true']");
  element?.scrollIntoView({ block: "nearest" });
}

function move(delta) {
  activeIndex.value = moveActiveIndex(activeIndex.value, delta, rows.value.length);
  scrollActiveIntoView();
}

/**
 * Runs the row under the cursor (or an explicitly clicked row).
 * @param {Object} [row] - The row to activate; defaults to the active row.
 */
async function activate(row = rows.value[activeIndex.value]) {
  if (!row) return;
  close();

  if (row.kind === "command") {
    await row.command.run?.();
    return;
  }

  if (row.kind === "chat") {
    await router.push(`/${row.conversation.id}`);
    return;
  }

  if (row.kind === "message") {
    await router.push({
      path: `/${row.result.conversationId}`,
      query: { m: row.result.messageId },
    });
  }
}

function onKeydown(event) {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      move(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      move(-1);
      break;
    case "Home":
      if (rows.value.length) {
        event.preventDefault();
        activeIndex.value = 0;
        scrollActiveIntoView();
      }
      break;
    case "End":
      if (rows.value.length) {
        event.preventDefault();
        activeIndex.value = rows.value.length - 1;
        scrollActiveIntoView();
      }
      break;
    case "Enter":
      event.preventDefault();
      activate();
      break;
    default:
      break;
  }
}

/** Label segments with the fuzzy-matched characters marked. */
function labelSegments(text, positions) {
  return highlightSegments(text ?? "", positions ?? []);
}

/** Snippet segments with the search terms marked. */
function resultSegments(result) {
  return snippetSegments(result.snippet);
}

const ROLE_ICONS = {
  user: "material-symbols:person-outline",
  assistant: "material-symbols:smart-toy-outline",
};

function roleIcon(role) {
  return ROLE_ICONS[role] || "material-symbols:chat-bubble-outline";
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="palette-overlay" />
      <DialogContent class="palette-content" @open-auto-focus.prevent="inputRef?.focus()">
        <VisuallyHidden>
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Search commands, chats, and message contents.
          </DialogDescription>
        </VisuallyHidden>

        <div class="palette-search">
          <Icon icon="material-symbols:search" width="20" height="20" class="palette-search-icon" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="palette-input"
            placeholder="Search chats and messages, or type a command…"
            aria-label="Search chats and messages, or type a command"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            :aria-activedescendant="activeKey ? `palette-row-${activeKey}` : undefined"
            autocomplete="off"
            spellcheck="false"
            @keydown="onKeydown"
          />
          <UiSpinner v-if="isSearching" :size="15" label="Searching" class="palette-status" />
        </div>

        <div id="palette-listbox" ref="listRef" class="palette-list" role="listbox">
          <div v-for="section in palette.sections" :key="section.key" class="palette-section">
            <div class="palette-section-label">{{ section.label }}</div>

            <button
              v-for="row in section.items"
              :id="`palette-row-${row.key}`"
              :key="row.key"
              type="button"
              class="palette-row"
              role="option"
              :aria-selected="activeKey === row.key"
              :data-active="activeKey === row.key"
              @click="activate(rows.find((r) => r.key === row.key))"
              @mousemove="activeIndex = rows.findIndex((r) => r.key === row.key)"
            >
              <template v-if="row.kind === 'command'">
                <Icon
                  :icon="row.command.icon || 'material-symbols:bolt-outline'"
                  width="18"
                  height="18"
                  class="palette-row-icon"
                />
                <span class="palette-row-main">
                  <span class="palette-row-title">
                    <span
                      v-for="(segment, i) in labelSegments(row.command.label, row.positions)"
                      :key="i"
                      :class="{ 'palette-match': segment.match }"
                    >{{ segment.text }}</span>
                  </span>
                </span>
                <UiKbd v-if="row.command.hint" :keys="row.command.hint" class="palette-hint" />
              </template>

              <template v-else-if="row.kind === 'chat'">
                <Icon
                  :icon="row.conversation.pinned ? 'boxicons:pin-alt-filled' : 'material-symbols:chat-bubble-outline'"
                  width="18"
                  height="18"
                  class="palette-row-icon"
                />
                <span class="palette-row-main">
                  <span class="palette-row-title">
                    <span
                      v-for="(segment, i) in labelSegments(row.conversation.title || 'Untitled', row.positions)"
                      :key="i"
                      :class="{ 'palette-match': segment.match }"
                    >{{ segment.text }}</span>
                  </span>
                </span>
                <span class="palette-meta">{{ relativeTime(row.conversation.lastUpdated) }}</span>
              </template>

              <template v-else>
                <Icon :icon="roleIcon(row.result.role)" width="18" height="18" class="palette-row-icon" />
                <span class="palette-row-main">
                  <span class="palette-row-title palette-row-snippet">
                    <span
                      v-for="(segment, i) in resultSegments(row.result)"
                      :key="i"
                      :class="{ 'palette-match': segment.match }"
                    >{{ segment.text }}</span>
                  </span>
                  <span class="palette-row-sub">{{ row.result.conversationTitle }}</span>
                </span>
              </template>
            </button>
          </div>

          <UiEmptyState
            v-if="showEmptyState"
            icon="material-symbols:search-off"
            :title="palette.term ? `No matches for “${palette.term}”` : 'Start typing to search'"
          />
        </div>

        <div class="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span class="palette-footer-modes"><kbd>&gt;</kbd> commands <kbd>@</kbd> chats <kbd>#</kbd> messages</span>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(6px);
  z-index: 3000;
}

/*
  Centred with auto margins rather than `left: 50%; translateX(-50%)`:
  the uEnter keyframes animate `transform` and settle on `transform: none`,
  which used to wipe the centring translate and leave the palette hanging
  off to the right of centre.
*/
.palette-content {
  position: fixed;
  top: 12vh;
  left: 0;
  right: 0;
  margin-inline: auto;
  width: calc(100% - 2rem);
  max-width: 40rem;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: var(--card);
  box-shadow: var(--shadow-overlay), 0 24px 60px #0000002e;
  z-index: 3001;
  animation: uEnter var(--duration-enter) var(--ease-out-strong) both;
}

.palette-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--muted-border);
}

.palette-search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 1rem;
  font-family: inherit;
}

.palette-input::placeholder {
  color: var(--text-placeholder);
}

.palette-status {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.palette-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.palette-section + .palette-section {
  margin-top: 4px;
}

.palette-section-label {
  padding: 8px 10px 4px;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.palette-row[data-active="true"] {
  background: var(--btn-hover);
}

.palette-row-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.palette-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.palette-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-row-snippet {
  color: var(--text-secondary);
}

.palette-row-sub {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-match {
  color: var(--primary);
  font-weight: 600;
}

.palette-meta {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.palette-hint {
  flex-shrink: 0;
}

.palette-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--muted-border);
  color: var(--text-muted);
  font-size: 0.72rem;
}

/* Same cap treatment as UiKbd, for the literal glyphs spelled out here */
.palette-footer kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-right: 3px;
  padding: 0 4px;
  border-radius: var(--radius-chip);
  background: var(--field);
  box-shadow: var(--shadow-hairline);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.68rem;
  line-height: 1;
}

@media (max-width: 600px) {
  .palette-content {
    top: 6vh;
    max-height: 80vh;
  }

  .palette-footer-modes {
    display: none;
  }
}
</style>
