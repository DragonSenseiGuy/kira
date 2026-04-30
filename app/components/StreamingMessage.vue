<template>
  <div class="markdown-content streaming-message-wrapper">
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
import { ref, watch, nextTick, computed } from 'vue';
import { md } from '../utils/markdown';
import { copyCode, downloadCode } from '../utils/codeBlockUtils';
import { highlightAllBlocks } from '../utils/lazyHighlight';

// Props
const props = defineProps({
  content: { type: String, default: '' },
  isComplete: { type: Boolean, default: false }
});

const emit = defineEmits(['complete', 'start']);

// Reactive HTML strings for static and streaming content
const staticHtml = ref('');
const streamingHtml = ref('');

// Internal state
let processedContent = '';
let hasEmittedStart = false;
let isProcessing = false;

// Make sure global functions are available
if (typeof window !== 'undefined') {
  window.copyCode = copyCode;
  window.downloadCode = downloadCode;
}

// --- Block Splitting ---

/**
 * Smart block splitting that respects fenced code blocks.
 * Prevents code blocks with blank lines from being prematurely split.
 */
function splitIntoBlocks(markdown) {
  if (!markdown) return [''];

  const lines = markdown.split('\n');
  const blocks = [];
  let currentBlock = [];
  let inCodeFence = false;
  let fenceChar = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for fence start/end (``` or ~~~)
    const fenceMatch = trimmed.match(/^(```|~~~)/);
    if (fenceMatch) {
      if (!inCodeFence) {
        // Starting a code fence — finalize any current block first
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
        inCodeFence = true;
        fenceChar = fenceMatch[1];
        currentBlock.push(line);
      } else if (trimmed.startsWith(fenceChar)) {
        // Ending a code fence
        currentBlock.push(line);
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inCodeFence = false;
        fenceChar = '';
      } else {
        currentBlock.push(line);
      }
    } else if (inCodeFence) {
      currentBlock.push(line);
    } else if (trimmed === '' && currentBlock.length > 0) {
      // Blank line outside code fence — potential block boundary
      const nextNonBlankIndex = lines.findIndex((l, idx) => idx > i && l.trim() !== '');
      const nextLine = nextNonBlankIndex !== -1 ? lines[nextNonBlankIndex] : null;

      // Patterns that typically start new blocks
      const blockStarters = /^#{1,6}\s|^>|^[-*+]\s|^\d+\.\s|^```|^~~~|^\|/;

      if (!nextLine || blockStarters.test(nextLine)) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      } else {
        currentBlock.push(line);
      }
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  return blocks.length ? blocks : [''];
}

// Render a block of markdown to HTML
function renderBlockHtml(mdText) {
  if (!mdText || mdText.trim().length === 0) return '';
  return md.render(mdText);
}

// --- Caret Management ---

/**
 * Add streaming caret to the end of the streaming HTML
 */
function addCaretToHtml(html) {
  // Always return at least the caret, even if no content
  if (!html || html.trim().length === 0) {
    return '<span class="streaming-caret"></span>';
  }
  
  // Find the last closing tag and insert caret before it
  // This ensures caret appears inline at the end of content
  const lastCloseMatch = html.match(/<\/[^>]+>$/);
  if (lastCloseMatch) {
    const insertPos = html.lastIndexOf(lastCloseMatch[0]);
    return html.slice(0, insertPos) + '<span class="streaming-caret"></span>' + html.slice(insertPos);
  }
  
  // No closing tag at end - just append caret
  return html + '<span class="streaming-caret"></span>';
}

// --- Content Processing ---

/**
 * Process content update and split into static/streaming portions
 */
function processContent(newContent, isComplete) {
  if (isProcessing) return;
  isProcessing = true;
  
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
      highlightAllBlocks(document.body);
      emit('complete');
    });
    
    isProcessing = false;
    return;
  }
  
  // Split content into blocks
  const blocks = splitIntoBlocks(newContent);
  
  if (blocks.length === 0) {
    staticHtml.value = '';
    streamingHtml.value = '';
    isProcessing = false;
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
    
    // Render complete blocks
    const staticContent = completeBlocks.map(renderBlockHtml).join('');
    staticHtml.value = staticContent;
    
    // Render streaming block with caret
    streamingHtml.value = addCaretToHtml(renderBlockHtml(streamingBlock));
  }
  
  processedContent = newContent;
  
  // Schedule highlighting for any new code blocks
  nextTick(() => {
    highlightAllBlocks(document.body);
  });
  
  isProcessing = false;
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
