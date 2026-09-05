<template>
  <!-- Providers without an icon get a neutral letter avatar instead of
       attempting to fetch a nonexistent image. -->
  <div
    v-if="!src"
    class="svg-logo logo-fallback"
    :style="{ fontSize: `calc(${size}px * 0.55)` }"
    :aria-label="label"
  >{{ initialLetter }}</div>
  <div v-else class="svg-logo" ref="svgContainerRef"></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  // Used by the fallback avatar when no src exists (e.g. the full model
  // catalog, or custom providers without logos).
  label: {
    type: String,
    default: ''
  },
  size: {
    type: Number,
    default: 24
  }
});

const initialLetter = computed(() => {
  const source = (props.label || '').trim();
  if (!source) return '•';
  // Use the first alphanumeric character so symbols like "+" don't win.
  const match = source.match(/[a-z0-9]/i);
  return (match ? match[0] : source[0]).toUpperCase();
});

const svgContainerRef = ref(null);

function decodeSvgFromDataUrl(url) {
  if (url.startsWith('data:image/svg+xml;base64,')) {
    const base64 = url.slice('data:image/svg+xml;base64,'.length);
    return decodeURIComponent(escape(atob(base64)));
  }
  if (url.startsWith('data:image/svg+xml,')) {
    return decodeURIComponent(url.slice('data:image/svg+xml,'.length));
  }
  return null;
}

const loadSvgContent = async () => {
  if (!svgContainerRef.value) return;

  try {
    let svgContent = decodeSvgFromDataUrl(props.src);

    if (svgContent === null) {
      const response = await fetch(props.src);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      svgContent = await response.text();
    }

    // The SVGs already use fill="currentColor", so just make sure we preserve this
    // and don't add unnecessary stroke attributes
    if (svgContainerRef.value) {  // Double-check it still exists
      svgContainerRef.value.innerHTML = svgContent;
    }
  } catch (error) {
    console.error('Error loading SVG:', error);
    if (svgContainerRef.value) {  // Double-check it still exists
      svgContainerRef.value.innerHTML = '<svg></svg>'; // Fallback
    }
  }
};

// Flag to track if component is still mounted
const isMounted = ref(true);

onMounted(() => {
  loadSvgContent();
});

// Watch for changes to the src prop and reload the SVG content when it changes
watch(() => props.src, () => {
  if (isMounted.value && props.src) {
    loadSvgContent();
  }
});

onUnmounted(() => {
  isMounted.value = false;
});
</script>

<style scoped>
.svg-logo {
  width: v-bind('props.size + "px"');
  height: v-bind('props.size + "px"');
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
}

.svg-logo :deep(svg) {
  width: 100%;
  height: 100%;
  fill: currentColor;
  color: inherit;
  /* Do not apply stroke to preserve original visual weight */
}

.logo-fallback {
  align-items: center;
  justify-content: center;
  font-weight: 700;
  line-height: 1;
  border-radius: 22%;
  background: var(--btn-hover, var(--border));
  color: var(--text-secondary);
  user-select: none;
}
</style>