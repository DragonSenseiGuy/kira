<template>
  <div ref="rootEl" class="markdown-content streaming-message-wrapper">
    <!-- Static content (complete blocks) - rendered as HTML string -->
    <div v-if="staticHtml" class="streaming-content-static" v-html="staticHtml"></div>
    
    <!-- Streaming content (current incomplete block) -->
    <!-- has-preceding-content class ensures proper margins when following static content -->
    <div 
      v-if="streamingHtml" 
      class="streaming-content-streaming"
      :class="{ 'has-preceding-content': staticHtml }"
      v-html="streamingHtml"
    ></div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { md } from '../utils/markdown';
import { copyCode, downloadCode } from '../utils/codeBlockUtils';
import { highlightAllBlocks } from '../utils/lazyHighlight';
import { splitIntoBlocks, addCaretToHtml } from '../utils/streamBlocks';

// Props
const props = defineProps({
  content: { type: String, default: '' },
  isComplete: { type: Boolean, default: false }
});

const emit = defineEmits(['complete', 'start']);

const rootEl = ref(null);

// Reactive HTML strings for static and streaming content
const staticHtml = ref('');
const streamingHtml = ref('');

// Internal state
let processedContent = '';
let hasEmittedStart = false;

// Make sure global functions are available
if (typeof window !== 'undefined') {
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
}

/**
 * Memoized markdown rendering for STATIC (finished) blocks.
 *
 * During streaming this component re-processes the full content on every
 * update; without the cache every finished block would be re-parsed by
 * markdown-it each frame. Blocks are immutable once complete, so a Map
 * keyed by block text gives near-100% hit rate. The cache is capped and
 * cleared wholesale when oversized — re-rendering after a clear is only
 * a one-frame cost.
 */
const staticRenderCache = new Map();
const STATIC_RENDER_CACHE_MAX = 300;

function renderBlockHtmlCached(mdText) {
  if (!mdText || mdText.trim().length === 0) return '';
  const cached = staticRenderCache.get(mdText);
  if (cached !== undefined) return cached;
  const html = md.render(mdText);
  if (staticRenderCache.size >= STATIC_RENDER_CACHE_MAX) {
    staticRenderCache.clear();
  }
  staticRenderCache.set(mdText, html);
  return html;
}

function renderBlockHtml(mdText) {
  if (!mdText || mdText.trim().length === 0) return '';
  return md.render(mdText);
}

// --- Highlight scheduling ---

let highlightTimer = null;

/**
 * Debounced, scoped highlighting. The previous implementation called
 * highlightAllBlocks(document.body) on EVERY streaming frame — an O(document)
 * DOM scan per token. Highlighting is purely cosmetic for finished code
 * blocks, so a short trailing debounce scoped to this component is
 * visually identical and dramatically cheaper.
 */
function scheduleHighlight() {
  if (highlightTimer) return;
  highlightTimer = setTimeout(() => {
    highlightTimer = null;
    const scope = rootEl.value || document.body;
    highlightAllBlocks(scope);
  }, 250);
}

onBeforeUnmount(() => {
  if (highlightTimer) {
    clearTimeout(highlightTimer);
    highlightTimer = null;
  }
});

// --- Content Processing ---

/**
 * Process content update and split into static/streaming portions
 */
function processContent(newContent, isComplete) {
  newContent = newContent || '';
  
  // Emit start event on first content
  if (!hasEmittedStart && newContent.length > 0) {
    emit('start');
    hasEmittedStart = true;
  }
  
  // Handle completion
  if (isComplete) {
    // Render everything as static
    const fullHtml = renderBlockHtml(newContent);
    staticHtml.value = fullHtml;
    streamingHtml.value = '';
    processedContent = newContent;
    
    // Trigger highlighting on completion
    nextTick(() => {
      highlightAllBlocks(rootEl.value || document.body);
      emit('complete');
    });
    
    return;
  }
  
  // Split content into blocks
  const blocks = splitIntoBlocks(newContent);
  
  if (blocks.length === 0) {
    staticHtml.value = '';
    streamingHtml.value = '';
    return;
  }
  
  if (blocks.length === 1) {
    // Only one block - it's streaming
    staticHtml.value = '';
    streamingHtml.value = addCaretToHtml(renderBlockHtml(blocks[0]));
  } else {
    // Multiple blocks - all but last are static, last is streaming
    const completeBlocks = blocks.slice(0, -1);
    const streamingBlock = blocks[blocks.length - 1];
    
    // Render complete blocks (memoized — finished blocks never change)
    const staticContent = completeBlocks.map(renderBlockHtmlCached).join('');
    staticHtml.value = staticContent;
    
    // Render streaming block with caret
    streamingHtml.value = addCaretToHtml(renderBlockHtml(streamingBlock));
  }
  
  processedContent = newContent;
  
  // Schedule debounced highlighting for any new code blocks
  scheduleHighlight();
}

// Watch for content changes
watch(
  () => [props.content, props.isComplete],
  ([newContent, isComplete]) => {
    // Reset start flag if content is cleared
    if (!newContent || newContent.length < processedContent.length) {
      hasEmittedStart = false;
      staticHtml.value = '';
      streamingHtml.value = '';
    }
    
    processContent(newContent, isComplete);
  },
  { immediate: true }
);
</script>

<style>
.streaming-message-wrapper {
  padding: 0;
}

/* 
 * Use display:contents so children of these containers appear as direct children
 * of the .markdown-content wrapper. This makes :first-child/:last-child rules 
 * work across both containers as if they were one continuous flow.
 */
.streaming-content-static {
  display: contents;
}

.streaming-content-streaming {
  display: contents;
}

/* 
 * Margin handling: Since both containers use display:contents, all their children
 * are direct children of .markdown-content. We need to ensure proper margins 
 * between the last element of static and first element of streaming.
 * 
 * The .markdown-content styles in code-blocks.css already handle this:
 * - >*:first-child gets margin-top: 0
 * - >*:last-child gets margin-bottom: 0
 * - Headers (h1-h3) have larger margin-top: 1.2em
 * 
 * With display:contents, these selectors work correctly across both containers.
 */
</style>
