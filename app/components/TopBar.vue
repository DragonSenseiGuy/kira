<template>
  <div class="top-bar" :class="{ 'with-border': !isScrolledTopValue }" ref="topBarRef">
    <div class="top-bar-content">
      <button v-if="!sidebarOpen" class="sidebar-toggle" @click="toggleSidebar" aria-label="Toggle sidebar">
        <Icon icon="material-symbols:side-navigation" width="22" height="22" />
      </button>
      <button v-if="!sidebarOpen" class="new-chat-btn" @click="handleNewChat" aria-label="New chat">
        <Icon icon="material-symbols:add-box-outline" width="22" height="22" />
      </button>

      <div v-if="(isIncognito && messages && messages.length > 0) || isIncognitoRoute" class="incognito-indicator">
        <Icon icon="mdi:incognito" width="18" height="18" />
        <span class="incognito-text">{{ isIncognitoRoute ? 'Incognito Mode' : 'Incognito mode' }}</span>
      </div>
      <div class="action-toggles">
        <button v-if="showIncognitoButton && !isIncognitoRoute" class="action-toggle incognito-toggle" :class="{ active: isIncognito }"
          @click="$emit('toggle-incognito')"
          :aria-label="isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'">
          <Icon icon="mdi:incognito" width="18" height="18" />
        </button>
        <button v-if="!parameterConfigOpen" class="action-toggle parameter-config-toggle"
          @click="$emit('toggle-parameter-config')" aria-label="Model parameters">
          <Icon icon="material-symbols:tune" width="18" height="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Icon } from "@iconify/vue";
import { useRoute, useRouter } from "vue-router";

const props = defineProps({
  isScrolledTop: {
    type: [Boolean, Object],
    default: true
  },
  toggleSidebar: {
    type: Function,
    default: () => { }
  },
  sidebarOpen: {
    type: Boolean,
    default: false
  },
  isIncognito: {
    type: Boolean,
    default: false
  },
  showIncognitoButton: {
    type: Boolean,
    default: false
  },
  messages: {
    type: Array,
    default: () => []
  },
  parameterConfigOpen: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['toggle-incognito', 'toggle-parameter-config']);

const route = useRoute();
const router = useRouter();
const topBarRef = ref(null);

const handleNewChat = () => {
  router.push('/');
};

const isIncognitoRoute = computed(() => route.path === '/incognito');

const isScrolledTopValue = computed(() => {
  return typeof props.isScrolledTop === 'boolean'
    ? props.isScrolledTop
    : props.isScrolledTop.value;
});
</script>

<style scoped>
.sidebar-toggle :deep(svg) {
  color: var(--text-primary);
}

.new-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin: 0;
  transition: background 0.18s;
  color: var(--text-primary);
}

.new-chat-btn:hover {
  background: var(--btn-hover);
}

.top-bar {
  position: sticky;
  top: 0;
  height: 48px;
  background-color: var(--bg);
  width: 100%;
  z-index: 100;
  flex-shrink: 0;
  border-bottom: 1px solid transparent;
  transition: border-bottom 0.2s ease;
}

.top-bar.with-border {
  border-bottom: 1px solid var(--border);
}

.top-bar-content {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  height: 100%;
  padding: 0 12px;
  gap: 8px;
}

.incognito-indicator {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.9rem;
  color: var(--text-secondary);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.incognito-text {
  font-weight: 600;
}

.action-toggles {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.action-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  padding: 0;
  margin: 0;
  transition: background 0.18s;
  color: var(--text-primary);
}

.action-toggle:hover {
  background: var(--btn-hover);
}

.action-toggle:active:not(.parameter-config-toggle),
.action-toggle.active:not(.parameter-config-toggle) {
  background-color: var(--primary);
  color: var(--primary-foreground);
}
</style>
