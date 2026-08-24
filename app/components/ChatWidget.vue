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
        <!-- Per-tool icon -->
        <Icon v-else :icon="primaryIcon" width="20" height="20" />
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
          <template v-else-if="headerDetail">
            <span>{{ displayedName }}</span>
            <span class="chat-widget-search-separator"></span>
            <span class="chat-widget-search-query">{{ headerDetail }}</span>
          </template>
          <template v-else>
            {{ displayedName }}
          </template>
        </div>
        <div v-if="displayedStatus" class="chat-widget-status" :class="{ 'is-live': statusIsLive }">{{ displayedStatus }}</div>
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
      <!-- Run Code (run_javascript) -->
      <div v-else-if="primaryKind === 'code'" class="cw-details">
        <div class="cw-section-label">Code</div>
        <pre class="cw-code">{{ runCode }}</pre>

        <template v-if="runResult.state !== 'running'">
          <div class="cw-status-row">
            <span class="cw-chip" :class="`cw-${runResult.state}`">
              {{ runResult.state === 'ok' ? 'Ran successfully' : runResult.state === 'timeout' ? 'Timed out' : 'Error' }}
            </span>
            <span v-if="runResult.logs.length" class="cw-meta">{{ runResult.logs.length }} console line{{ runResult.logs.length === 1 ? '' : 's' }}</span>
          </div>

          <template v-if="runResult.state === 'error' && runResult.error">
            <div class="cw-section-label">Error</div>
            <pre class="cw-code cw-code-error">{{ runResult.error }}</pre>
          </template>

          <template v-if="runResult.hasResult && runResult.valueText">
            <div class="cw-section-label">Returned</div>
            <pre class="cw-code">{{ runResult.valueText }}</pre>
          </template>

          <template v-if="runResult.logs.length">
            <div class="cw-section-label">Console output</div>
            <pre class="cw-code cw-logs">{{ runResult.logs.join('\n') }}</pre>
          </template>
        </template>
        <div v-else class="cw-meta">Running…</div>
      </div>

      <!-- Workspace file tools -->
      <div
        v-else-if="FILE_KINDS.includes(primaryKind)"
        class="cw-details"
      >
        <!-- write_file -->
        <template v-if="primaryKind === 'file-write'">
          <div class="cw-kv"><span class="cw-kv-key">Path</span><span class="cw-mono">{{ args.path || '—' }}</span></div>
          <div v-if="args.content" class="cw-section-label">Content</div>
          <pre v-if="args.content" class="cw-code">{{ truncate(args.content, 800) }}{{ (args.content.length > 800) ? '\n…' : '' }}</pre>
          <div v-if="writeResult" class="cw-meta">{{ writeResult }}</div>
        </template>

        <!-- read_file -->
        <template v-else-if="primaryKind === 'file-read'">
          <div class="cw-kv"><span class="cw-kv-key">Path</span><span class="cw-mono">{{ args.path || '—' }}</span></div>
          <template v-if="readResult">
            <div class="cw-section-label">Contents</div>
            <pre class="cw-code">{{ readResult }}</pre>
          </template>
          <div v-else-if="hasResultPayload" class="cw-meta">File not found or unreadable.</div>
        </template>

        <!-- edit_file: show as old → new blocks -->
        <template v-else-if="primaryKind === 'file-edit'">
          <div class="cw-kv"><span class="cw-kv-key">Path</span><span class="cw-mono">{{ args.path || '—' }}</span></div>
          <div class="cw-section-label">Before</div>
          <pre class="cw-code cw-code-old">{{ args.old_text || '(empty)' }}</pre>
          <div class="cw-section-label">After</div>
          <pre class="cw-code cw-code-new">{{ args.new_text !== undefined && args.new_text !== null ? args.new_text : '(empty)' }}</pre>
          <div v-if="hasResultPayload" class="cw-meta">Applied.</div>
        </template>

        <!-- delete_file -->
        <template v-else-if="primaryKind === 'file-delete'">
          <div class="cw-kv"><span class="cw-kv-key">Path</span><span class="cw-mono">{{ args.path || '—' }}</span></div>
          <div v-if="hasResultPayload" class="cw-meta">Deleted.</div>
        </template>

        <!-- move / rename -->
        <template v-else-if="primaryKind === 'file-move'">
          <div class="cw-kv"><span class="cw-kv-key">From</span><span class="cw-mono">{{ args.from || args.path || '—' }}</span></div>
          <div class="cw-kv"><span class="cw-kv-key">To</span><span class="cw-mono">{{ args.to || args.new_name || '—' }}</span></div>
          <div v-if="hasResultPayload" class="cw-meta">Moved.</div>
        </template>

        <!-- search_files -->
        <template v-else-if="primaryKind === 'file-search'">
          <div class="cw-kv"><span class="cw-kv-key">Pattern</span><span class="cw-mono">{{ args.pattern || '—' }}</span></div>
          <div v-if="searchMatches !== null" class="cw-meta">{{ searchMatches }} match{{ searchMatches === 1 ? '' : 'es' }}</div>
          <div v-if="searchFiles.length" class="cw-files">
            <div v-for="f in searchFiles.slice(0, 20)" :key="f.path" class="cw-file-row">
              <span class="cw-mono cw-file-path">{{ f.path }}</span>
              <span class="cw-file-size">{{ formatBytes(f.size) }}</span>
            </div>
          </div>
        </template>

        <!-- list_files -->
        <template v-else>
          <div class="cw-kv"><span class="cw-kv-key">Directory</span><span class="cw-mono">{{ args.path || '(workspace root)' }}</span></div>
          <template v-if="listFiles.length">
            <div class="cw-files">
              <div v-for="f in listFiles.slice(0, 100)" :key="f.path" class="cw-file-row">
                <span class="cw-mono cw-file-path">{{ f.path }}</span>
                <span class="cw-file-size">{{ formatBytes(f.size) }}</span>
              </div>
              <div v-if="listTruncated" class="cw-meta">Listing truncated — more files exist.</div>
              <div v-else-if="listFiles.length > 100" class="cw-meta">{{ listFiles.length - 100 }} more not shown.</div>
            </div>
          </template>
          <div v-else-if="hasResultPayload" class="cw-meta">No files found.</div>
        </template>
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
import {
  getToolDisplay,
  parseToolJson,
  parsePartialToolArgs,
  toolHeaderDetail,
  parseRunResult,
  formatBytes,
  prettifyToolName,
  TOOL_DISPLAY,
} from '../utils/toolDisplay';

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
  },
  // True while the parent message is still streaming (tool may be mid-call)
  streaming: {
    type: Boolean,
    default: false
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
// While a tool call is still STREAMING its arguments are incomplete JSON —
// parse leniently so widgets show live path/content instead of nothing.
const args = computed(() => {
  const raw = props.toolCall?.function?.arguments ??
    primaryTool.value?.function?.arguments;
  if (!raw) return {};
  const { args: parsed } = parsePartialToolArgs(raw);
  return parsed;
});

// --- Sandbox / workspace tool presentation -------------------------------

/** The representative tool for icon/title/detail purposes. */
const primaryTool = computed(() => {
  if (props.toolCall) return props.toolCall;
  if (props.toolCalls && props.toolCalls.length > 0) return props.toolCalls[0];
  return null;
});

const primaryName = computed(
  () => primaryTool.value?.function?.name || primaryTool.value?.name || '',
);

const FILE_KINDS = [
  'file-write',
  'file-read',
  'file-edit',
  'file-delete',
  'file-move',
  'file-search',
  'file-list',
];

const primaryDisplay = computed(() => getToolDisplay(primaryName.value));

const primaryKind = computed(() =>
  props.type === 'tool' ? primaryDisplay.value.kind : 'generic',
);

const primaryIcon = computed(() => primaryDisplay.value.icon);

const primaryArgsJson = computed(() => {
  const t = primaryTool.value;
  return t?.function?.arguments ?? (t?.name ? undefined : undefined);
});

const headerDetail = computed(() => {
  if (props.type !== 'tool' || isSearch.value || isWebCrawl.value || isMemory.value) return '';
  const kindsWithDetail = ['code', 'file-write', 'file-read', 'file-edit', 'file-delete', 'file-move'];
  if (!kindsWithDetail.includes(primaryKind.value)) return '';
  return toolHeaderDetail(primaryName.value, primaryTool.value?.function?.arguments);
});

const runCode = computed(() => {
  const raw = primaryTool.value?.function?.arguments;
  if (!raw) return '';
  return parsePartialToolArgs(raw).args.code || '';
});

const runResult = computed(() => {
  if (primaryKind.value !== 'code') {
    return { state: 'running', valueText: null, logs: [], error: null, hasResult: false };
  }
  const t = primaryTool.value;
  return parseRunResult(t?.result ?? props.result ?? null);
});

const writeResult = computed(() => {
  if (primaryKind.value !== 'file-write') return null;
  const data = parseToolJson(primaryTool.value?.result);
  if (!data.path && !data.bytes) return null;
  return data.bytes !== undefined
    ? `Saved ${data.path} (${formatBytes(data.bytes)})`
    : `Saved ${data.path}`;
});

const readResult = computed(() => {
  if (primaryKind.value !== 'file-read') return null;
  const data = parseToolJson(primaryTool.value?.result);
  return typeof data.content === 'string' ? data.content : null;
});

const hasResultPayload = computed(() => !!primaryTool.value?.result);

const listFiles = computed(() => {
  if (primaryKind.value !== 'file-list') return [];
  const data = parseToolJson(primaryTool.value?.result);
  return Array.isArray(data.files) ? data.files : [];
});

const listTruncated = computed(() => {
  const data = parseToolJson(primaryTool.value?.result);
  return data.truncated === true;
});

const searchMatches = computed(() => {
  if (primaryKind.value !== 'file-search') return null;
  const data = parseToolJson(primaryTool.value?.result);
  return typeof data.matches === 'number' ? data.matches : null;
});

const searchFiles = computed(() => {
  if (primaryKind.value !== 'file-search') return [];
  const data = parseToolJson(primaryTool.value?.result);
  return Array.isArray(data.files) ? data.files : [];
});

function truncate(text, max) {
  if (typeof text !== 'string') return '';
  return text.length <= max ? text : text.slice(0, max);
}

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

  const knownTitle = TOOL_DISPLAY[primaryName.value]?.title;

  // Check for tool groups first
  if (isToolGroup.value && props.toolCalls && props.toolCalls.length > 0) {
    const allSameType = props.toolCalls.every(
      (t) => (t?.function?.name || t?.name || t?.type || t?.id) === primaryName.value,
    );
    if (allSameType) {
      return `${knownTitle || prettifyToolName(primaryName.value)} (${props.toolCalls.length} calls)`;
    }
    return `Multiple Tools (${props.toolCalls.length} calls)`;
  }

  // Single tool — prefer the human title, then memory phrasing, then prettified.
  if (primaryName.value) {
    if (knownTitle) return knownTitle;
    if (primaryName.value === 'addMemory') return 'Added memory';
    if (primaryName.value === 'modifyMemory') return 'Modified memory';
    if (primaryName.value === 'deleteMemory') return 'Deleted memory';
    return prettifyToolName(primaryName.value);
  }

  return 'Tool: unknown';
});

const displayedStatus = computed(() => {
  // Reasoning type doesn't show status below the name
  if (props.type === 'reasoning') return null;

  const kind = primaryKind.value;

  // Code execution: reflect run state directly.
  if (kind === 'code') {
    switch (runResult.value.state) {
      case 'ok': return 'Completed';
      case 'error': return 'Failed';
      case 'timeout': return 'Timed out';
      default: return props.streaming ? 'Running…' : null;
    }
  }

  // File tools: reflect live progress while streaming, completion after.
  if (FILE_KINDS.includes(kind)) {
    if (hasResultPayload.value) return 'Completed';
    if (!props.streaming) return null;
    const verbs = {
      'file-write': 'Writing…',
      'file-read': 'Reading…',
      'file-edit': 'Patching…',
      'file-delete': 'Deleting…',
      'file-move': 'Moving…',
      'file-search': 'Searching…',
      'file-list': 'Listing…',
    };
    return verbs[kind] || 'Working…';
  }

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

const statusIsLive = computed(() =>
  typeof displayedStatus.value === 'string' && displayedStatus.value.endsWith('…'),
);

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

<style scoped>
.cw-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cw-section-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.cw-code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(128,128,128,0.25));
  background: var(--bg-secondary, rgba(128,128,128,0.08));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

.cw-code-error {
  color: #dc2626;
  border-color: color-mix(in srgb, #dc2626 35%, transparent);
}

.cw-logs {
  color: var(--text-secondary);
}

.cw-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cw-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
}

.cw-ok {
  background: color-mix(in srgb, #16a34a 14%, transparent);
  color: #16a34a;
}

.cw-error {
  background: color-mix(in srgb, #dc2626 13%, transparent);
  color: #dc2626;
}

.cw-timeout {
  background: color-mix(in srgb, #d97706 15%, transparent);
  color: #d97706;
}

.cw-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.cw-kv {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cw-kv-key {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.cw-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  word-break: break-all;
}

.cw-files {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border, rgba(128,128,128,0.25));
  border-radius: 8px;
  overflow: hidden;
}

.cw-file-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border, rgba(128,128,128,0.18));
  font-size: 0.76rem;
}

.cw-file-row:last-child {
  border-bottom: none;
}

.cw-file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cw-file-size {
  color: var(--text-secondary);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.cw-code-old {
  border-color: color-mix(in srgb, #dc2626 35%, transparent);
}

.cw-code-new {
  border-color: color-mix(in srgb, #16a34a 40%, transparent);
}

.chat-widget-status.is-live {
  animation: cw-live-pulse 1.2s ease-in-out infinite;
}

@keyframes cw-live-pulse {
  50% { opacity: 0.45; }
}
</style>
