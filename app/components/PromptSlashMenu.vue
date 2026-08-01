<script setup>
/**
 * Slash-command menu for saved prompts.
 *
 * Rendered above the composer while the user is typing a `/trigger`. It owns
 * no input state: the composer detects the trigger and feeds the query in,
 * and this component reports the chosen prompt back.
 */
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { fuzzyFilter, highlightSegments } from "~/utils/fuzzyMatch";
import { extractPlaceholders } from "~/composables/promptLibrary";
import { moveActiveIndex, clampActiveIndex } from "~/composables/commandPalette";

const props = defineProps({
  prompts: {
    type: Array,
    default: () => [],
  },
  /** Text typed after the `/`. */
  query: {
    type: String,
    default: "",
  },
  open: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["select", "close"]);

const activeIndex = ref(0);

const matches = computed(() =>
  fuzzyFilter(props.prompts, props.query, {
    key: (prompt) => `${prompt.name} ${prompt.description || ""}`,
    limit: 8,
  }),
);

watch(matches, (list) => {
  activeIndex.value = clampActiveIndex(activeIndex.value, list.length);
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) activeIndex.value = 0;
  },
);

/** Placeholder count, surfaced so users know a prompt needs filling in. */
function placeholderCount(prompt) {
  return extractPlaceholders(prompt.body).length;
}

/** Name segments with the fuzzy match marked. */
function nameSegments(match) {
  const name = match.item.name;
  return highlightSegments(
    name,
    match.positions.filter((position) => position < name.length),
  );
}

function choose(index = activeIndex.value) {
  const match = matches.value[index];
  if (match) emit("select", match.item);
}

/**
 * Lets the composer forward key events without giving up focus.
 *
 * @param {KeyboardEvent} event - The composer's keydown event.
 * @returns {boolean} Whether the menu consumed the key.
 */
function handleKeydown(event) {
  if (!props.open || matches.value.length === 0) return false;

  switch (event.key) {
    case "ArrowDown":
      activeIndex.value = moveActiveIndex(activeIndex.value, 1, matches.value.length);
      return true;
    case "ArrowUp":
      activeIndex.value = moveActiveIndex(activeIndex.value, -1, matches.value.length);
      return true;
    case "Enter":
    case "Tab":
      choose();
      return true;
    case "Escape":
      emit("close");
      return true;
    default:
      return false;
  }
}

defineExpose({ handleKeydown, hasMatches: computed(() => matches.value.length > 0) });
</script>

<template>
  <div v-if="props.open && matches.length > 0" class="slash-menu" role="listbox" aria-label="Saved prompts">
    <div class="slash-menu-header">Saved prompts</div>
    <button
      v-for="(match, index) in matches"
      :key="match.item.id"
      type="button"
      class="slash-row"
      role="option"
      :aria-selected="index === activeIndex"
      :data-active="index === activeIndex"
      @mousedown.prevent="choose(index)"
      @mousemove="activeIndex = index"
    >
      <Icon icon="material-symbols:bookmark-outline" width="16" height="16" class="slash-icon" />
      <span class="slash-body">
        <span class="slash-name">
          /<span
            v-for="(segment, i) in nameSegments(match)"
            :key="i"
            :class="{ 'slash-match': segment.match }"
          >{{ segment.text }}</span>
        </span>
        <span v-if="match.item.description" class="slash-description">{{ match.item.description }}</span>
      </span>
      <UiBadge v-if="placeholderCount(match.item)" tone="neutral" class="slash-fields">
        {{ placeholderCount(match.item) }} to fill
      </UiBadge>
    </button>
    <div class="slash-menu-footer">
      <kbd>↑</kbd><kbd>↓</kbd> select · <kbd>Tab</kbd> insert · <kbd>Esc</kbd> dismiss
    </div>
  </div>
</template>

<style scoped>
.slash-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 40;
  max-height: 280px;
  overflow-y: auto;
  padding: 5px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--popover-bg);
  box-shadow: var(--popover-shadow);
  animation: popIn var(--duration) var(--ease-out-strong) forwards;
}

.slash-menu-header {
  padding: 6px 8px 4px;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.slash-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.slash-row[data-active="true"] {
  background: var(--btn-hover);
}

.slash-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.slash-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.slash-name {
  overflow: hidden;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-match {
  color: var(--primary);
  font-weight: 600;
}

.slash-description {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-fields {
  flex-shrink: 0;
}

.slash-menu-footer {
  padding: 6px 8px 2px;
  border-top: 1px solid var(--muted-border);
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 0.7rem;
}

/* Same cap treatment as UiKbd, for the literal glyphs spelled out here */
.slash-menu-footer kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  margin-right: 3px;
  padding: 0 4px;
  border-radius: var(--radius-chip);
  background: var(--field);
  box-shadow: var(--shadow-hairline);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.66rem;
  line-height: 1;
}
</style>
