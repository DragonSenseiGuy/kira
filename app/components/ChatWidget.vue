<template>
  <div class="chat-widget">
    <div
      class="chat-widget-header" :class="{ open: isOpen }"
      @click="isOpen = !isOpen"
    >
      <div class="chat-widget-icon">
        <!-- Reasoning icon -->
        <svg v-if="type === 'reasoning'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="6"/>
        </svg>
        <!-- Web Crawl icon -->
        <Icon v-else-if="isWebCrawl" icon="material-symbols:web-asset" width="20" height="20" />
        <!-- Search icon -->
        <Icon v-else-if="isSearch" icon="material-symbols:search-rounded" width="20" height="20" />
        <!-- Memory icon -->
        <Icon v-else-if="isMemory" icon="material-symbols:psychology-rounded" width="20" height="20" />
        <!-- Tool icon -->
        <Icon v-else icon="material-symbols:build-circle-outline-rounded" width="20" height="20" />
      </div>

      <div class="chat-widget-info">
        <div class="chat-widget-name">
          <template v-if="isWebCrawl">
            <span class="chat-widget-search-label">Crawled Webpages</span>
          </template>
          <template v-else-if="isSearch">
            <span class="chat-widget-search-label">Search</span>
            <span class="chat-widget-search-separator"></span>
            <span class="chat-widget-search-query">{{ searchQuery }}</span>
          </template>
          <template v-else>
            {{ displayedName }}
          </template>
        </div>
        <div v-if="displayedStatus" class="chat-widget-status">{{ displayedStatus }}</div>
      </div>

      <div class="chat-widget-toggle">
        <Icon
          icon="material-symbols:chevron-right-rounded"
          width="20" height="20"
          :class="{ 'rotate': isOpen }"
        />
      </div>
    </div>

    <div v-show="isOpen" class="chat-widget-details">
      <!-- Reasoning content -->
      <div v-if="type === 'reasoning'" class="reasoning-content-area">
        <div class="reasoning-content markdown-content" v-html="renderedContent"></div>
      </div>
      <!-- Web Crawl results (getPageContents) -->
      <div v-else-if="isWebCrawl" class="web-crawl-results">
        <div v-for="(result, index) in webCrawlResults" :key="index" class="web-crawl-result-item">
          <a :href="result.url" target="_blank" rel="noopener noreferrer" class="web-crawl-result-link">
            <div class="web-crawl-result-title">{{ result.title || getDomain(result.url) }}</div>
            <div class="web-crawl-result-domain">{{ getDomain(result.url) }}</div>
            <div v-if="result.content" class="web-crawl-result-excerpt">{{ truncateContent(result.content, 200) }}</div>
          </a>
        </div>
      </div>
      <!-- Search results -->
      <div v-else-if="isSearch" class="search-results">
        <div v-for="(result, index) in searchResults" :key="index" class="search-result-item">
          <a :href="result.url" target="_blank" rel="noopener noreferrer" class="search-result-link">
            <div class="search-result-title">{{ result.title }}</div>
            <div class="search-result-domain">{{ getDomain(result.url) }}</div>
          </a>
        </div>
      </div>
      <!-- Specialized Memory UI -->
      <div v-else-if="isMemory" class="memory-details">
        <div v-for="(item, index) in memoryItems" :key="index" class="memory-item" :class="item.type">
          <div class="memory-item-header">
            <Icon v-if="item.type === 'add'" icon="material-symbols:add-circle-outline-rounded" class="memory-item-icon" />
            <Icon v-else-if="item.type === 'modify'" icon="material-symbols:edit-note-rounded" class="memory-item-icon" />
            <Icon v-else icon="material-symbols:delete-outline-rounded" class="memory-item-icon" />
            <span class="memory-item-type">{{ item.typeName }}</span>
          </div>
          <div class="memory-item-content">
            <template v-if="item.type === 'modify'">
              <div class="memory-diff">
                <div class="memory-diff-old">
                  <span class="diff-label">Old</span>
                  <p>{{ item.oldFact }}</p>
                </div>
                <div class="memory-diff-icon">
                  <Icon icon="material-symbols:arrow-downward-rounded" />
                </div>
                <div class="memory-diff-new">
                  <span class="diff-label">New</span>
                  <p>{{ item.newFact }}</p>
                </div>
              </div>
            </template>
            <template v-else>
              <p>{{ item.fact }}</p>
            </template>
          </div>
        </div>
      </div>
      <!-- Tool arguments (non-search, non-memory tools) -->
      <div v-else class="tool-args">
        <pre>{{ formattedArgs }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Icon } from "@iconify/vue";
import { md } from '../utils/markdown';

const props = defineProps({
  // Widget type: 'reasoning' or 'tool'
  type: {
    type: String,
    default: 'tool',
    validator: (value) => ['reasoning', 'tool'].includes(value)
  },
  // Reasoning properties
  content: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    default: ''
  },
  // Tool properties (for both single tools and tool groups)
  toolCall: {
    type: Object,
    default: null
  },
  toolCalls: {
    type: Array,
    default: () => []
  },
  result: {
    type: String,
    default: null
  }
});

const isOpen = ref(false);

// Determine if this represents a tool group or single tool
const isToolGroup = computed(() => {
  if (props.type === 'reasoning') return false;
  // If we have toolCalls array with multiple items, it's a group
  if (props.toolCalls && props.toolCalls.length > 0) {
    return props.toolCalls.length > 1;
  }
  // If we only have a single toolCall, it's not a group
  return false;
});

const isSearch = computed(() => {
  if (props.type === 'reasoning') return false;
  // Check if single tool call is search
  if (props.toolCall) {
    return props.toolCall?.function?.name === 'search';
  }
  // Check if tool group (or single item in array) is search
  if (props.toolCalls && props.toolCalls.length > 0) {
    return props.toolCalls[0]?.function?.name === 'search';
  }
  return false;
});

const isWebCrawl = computed(() => {
  if (props.type === 'reasoning') return false;
  // Check if single tool call is getPageContents
  if (props.toolCall) {
    return props.toolCall?.function?.name === 'getPageContents';
  }
  // Check if tool group (or single item in array) is getPageContents
  if (props.toolCalls && props.toolCalls.length > 0) {
    return props.toolCalls[0]?.function?.name === 'getPageContents';
  }
  return false;
});

const isMemory = computed(() => {
  if (props.type === 'reasoning') return false;
  const memoryTools = ['addMemory', 'modifyMemory', 'deleteMemory'];

  if (props.toolCall) {
    return memoryTools.includes(props.toolCall?.function?.name);
  }

  if (props.toolCalls && props.toolCalls.length > 0) {
    return memoryTools.includes(props.toolCalls[0]?.function?.name);
  }

  return false;
});

// Phase 2.2: Use cached parsed args
const args = computed(() => {
  if (props.toolCall?.function?.arguments) {
    try {
      return JSON.parse(props.toolCall.function.arguments);
    } catch {
      return {};
    }
  }
  return {};
});

const searchArgs = computed(() => {
  if (props.toolCalls?.length > 0 && props.toolCalls[0]?.function?.arguments) {
    try {
      return JSON.parse(props.toolCalls[0].function.arguments);
    } catch {
      return {};
    }
  }
  return {};
});

const memoryItems = computed(() => {
  if (!isMemory.value) return [];

  const tools = props.toolCalls && props.toolCalls.length > 0
    ? props.toolCalls
    : (props.toolCall ? [props.toolCall] : []);

  return tools.map(tool => {
    let toolArgs = {};
    try {
      toolArgs = JSON.parse(tool?.function?.arguments || '{}');
    } catch (e) {}

    const name = tool?.function?.name;
    if (name === 'addMemory') {
      return {
        type: 'add',
        typeName: 'Added Memory',
        fact: toolArgs.fact
      };
    } else if (name === 'modifyMemory') {
      return {
        type: 'modify',
        typeName: 'Updated Memory',
        oldFact: toolArgs.oldFact,
        newFact: toolArgs.newFact
      };
    } else if (name === 'deleteMemory') {
      return {
        type: 'delete',
        typeName: 'Forgotten Memory',
        fact: toolArgs.fact
      };
    }
    return null;
  }).filter(Boolean);
});

// Rendered content for reasoning type
const renderedContent = computed(() => {
  if (props.type === 'reasoning' && props.content) {
    return md.render(props.content);
  }
  return '';
});

const searchQuery = computed(() => {
  if (!isSearch.value) return '';
  if (isToolGroup.value) return searchArgs.value.q || '...';
  if (props.toolCall) return args.value.q || '...';
  // Fallback to searchArgs if it exists
  if (searchArgs.value.q) return searchArgs.value.q;
  return '...';
});

const displayedName = computed(() => {
  // Reasoning type
  if (props.type === 'reasoning') {
    return props.status || 'Reasoning Process';
  }

  // Tool type - Search
  if (isSearch.value) {
    return 'Search';
  }

  // Check for tool groups first
  if (isToolGroup.value && props.toolCalls && props.toolCalls.length > 0) {
    const firstTool = props.toolCalls[0];
    // Get the type/name of the first tool more comprehensively
    const firstToolRawType = firstTool?.function?.name ||
                           firstTool?.name ||
                           firstTool?.type ||
                           firstTool?.id ||
                           'unknown';

    // Make the type user-friendly
    let firstToolType = firstToolRawType;
    if (firstToolRawType === 'addMemory') firstToolType = 'Added memory';
    else if (firstToolRawType === 'modifyMemory') firstToolType = 'Modified memory';
    else if (firstToolRawType === 'deleteMemory') firstToolType = 'Deleted memory';
    else {
      // Just capitalize the first letter for normal tools
      firstToolType = firstToolRawType.charAt(0).toUpperCase() + firstToolRawType.slice(1);
    }

    const allSameType = props.toolCalls.every(tool => {
      const toolType = tool?.function?.name || tool?.name || tool?.type || tool?.id || 'unknown';
      return toolType === firstToolRawType;
    });

    if (allSameType) {
      return `${firstToolType} (${props.toolCalls.length} calls)`;
    } else {
      return `Multiple Tools (${props.toolCalls.length} calls)`;
    }
  }

  // Check for single tool call
  if (props.toolCall) {
    // Try different possible locations for the function name
    let functionName = props.toolCall.function?.name ||
                      props.toolCall.name ||
                      props.toolCall.type ||
                      props.toolCall.id;

    if (functionName) {
      // Handle memory management tools specifically
      if (functionName === 'addMemory') return 'Added memory';
      if (functionName === 'modifyMemory') return 'Modified memory';
      if (functionName === 'deleteMemory') return 'Deleted memory';
      return `${functionName.charAt(0).toUpperCase() + functionName.slice(1)} Tool`;
    }
  }

  // Last resort: try to get info from toolCalls even if not technically a "group"
  // This handles cases where a single tool is passed in the toolCalls array
  if (props.toolCalls && props.toolCalls.length === 1) {
    const singleTool = props.toolCalls[0];
    let functionName = singleTool?.function?.name ||
                      singleTool?.name ||
                      singleTool?.type ||
                      singleTool?.id;

    if (functionName) {
      // Handle memory management tools specifically
      if (functionName === 'addMemory') return 'Added memory';
      if (functionName === 'modifyMemory') return 'Modified memory';
      if (functionName === 'deleteMemory') return 'Deleted memory';
      return `${functionName.charAt(0).toUpperCase() + functionName.slice(1)} Tool`;
    }
  }

  return 'Tool: unknown';
});

const displayedStatus = computed(() => {
  // Reasoning type doesn't show status below the name
  if (props.type === 'reasoning') return null;
  
  // For tool groups, show completion status only for non-search tools
  if (isToolGroup.value && !isSearch.value && props.toolCalls) {
    const completedTools = props.toolCalls.filter(tool => tool.result);
    if (completedTools.length === props.toolCalls.length && props.toolCalls.length > 0) {
      return 'Completed';
    } else if (completedTools.length > 0) {
      return `${completedTools.length}/${props.toolCalls.length} completed`;
    }
  }
  return null;
});

// Parsed args for all tools in a group (cached)
const parsedToolGroupArgs = computed(() => {
  if (!isToolGroup.value || !props.toolCalls?.length) return [];
  return props.toolCalls.map(tool => {
    try {
      return JSON.parse(tool?.function?.arguments || '{}');
    } catch {
      return {};
    }
  });
});

const formattedArgs = computed(() => {
  if (isToolGroup.value) {
    if (isSearch.value) return '';
    return JSON.stringify(parsedToolGroupArgs.value, null, 2);
  }

  // Single tool — reuse already-parsed args
  return JSON.stringify(args.value, null, 2);
});

const searchResults = computed(() => {
  if (!isSearch.value) return [];

  // Check toolCalls array first (handles both groups and single items)
  if (props.toolCalls && props.toolCalls.length > 0) {
    // Combine results from all tools in the array
    let allResults = [];
    for (const tool of props.toolCalls) {
      if (tool && tool.result) {
        try {
          const data = JSON.parse(tool.result);
          if (data.results && Array.isArray(data.results)) {
            allResults = allResults.concat(data.results);
          }
        } catch (e) {
          console.error('Error parsing search result:', e);
        }
      }
    }
    return allResults;
  } 
  
  // Fallback to single toolCall prop (legacy usage)
  if (props.toolCall && props.result) {
    try {
      const data = JSON.parse(props.result);
      if (data.results && Array.isArray(data.results)) {
        return data.results;
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  return [];
});

const webCrawlResults = computed(() => {
  if (!isWebCrawl.value) return [];

  // Check toolCalls array first
  if (props.toolCalls && props.toolCalls.length > 0) {
    let allResults = [];
    for (const tool of props.toolCalls) {
      if (tool && tool.result) {
        try {
          const data = JSON.parse(tool.result);
          if (data.results && Array.isArray(data.results)) {
            allResults = allResults.concat(data.results);
          }
        } catch (e) {
          console.error('Error parsing web crawl result:', e);
        }
      }
    }
    return allResults;
  }
  
  // Fallback to single toolCall prop
  if (props.toolCall && props.result) {
    try {
      const data = JSON.parse(props.result);
      if (data.results && Array.isArray(data.results)) {
        return data.results;
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  return [];
});

function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
}

function truncateContent(content, maxLength) {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength).trim() + '...';
}
</script>
