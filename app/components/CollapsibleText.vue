<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { isLongMessage, COLLAPSED_LINES } from "../utils/longMessage";

const props = defineProps({
  text: { type: String, default: "" },
});

const textEl = ref(null);
const isLong = ref(false);
const expanded = ref(false);
let observer = null;

// The text's real height at the bubble's current width decides whether it
// is long, so the answer follows the screen size and font.
function measure() {
  const el = textEl.value;
  if (!el) return;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
  // scrollHeight is the full height even while the text is clamped.
  isLong.value = isLongMessage(el.scrollHeight, lineHeight);
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(measure);
    observer.observe(textEl.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.text, () => nextTick(measure));
</script>

<template>
  <div
    ref="textEl"
    class="user-text"
    :class="{ collapsed: isLong && !expanded }"
    :style="{ '--collapsed-lines': COLLAPSED_LINES }"
  >{{ text }}</div>
  <button
    v-if="isLong"
    type="button"
    class="user-text-toggle"
    :aria-expanded="expanded"
    @click="expanded = !expanded"
  >
    {{ expanded ? 'Show less' : 'Show more' }}
  </button>
</template>

<style scoped>
.user-text {
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}

.user-text.collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--collapsed-lines);
  line-clamp: var(--collapsed-lines);
  overflow: hidden;
}

.user-text-toggle {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  opacity: 0.7;
  cursor: pointer;
}

.user-text-toggle:hover,
.user-text-toggle:focus-visible {
  opacity: 1;
  text-decoration: underline;
}
</style>
