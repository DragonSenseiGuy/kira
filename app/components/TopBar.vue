<template>
  <div class="top-bar" :class="{ 'with-border': !isScrolledTopValue }" ref="topBarRef">
    <div class="top-bar-content">
      <UiTooltip v-if="!sidebarOpen" content="Toggle sidebar" side="bottom" shortcut="mod+b">
        <UiIconButton
          icon="material-symbols:side-navigation"
          label="Toggle sidebar"
          @click="toggleSidebar"
        />
      </UiTooltip>

      <UiTooltip v-if="!sidebarOpen" content="New chat" side="bottom" shortcut="mod+alt+n">
        <UiIconButton
          icon="material-symbols:add-box-outline"
          label="New chat"
          @click="handleNewChat"
        />
      </UiTooltip>

      <UiBadge
        v-if="(isIncognito && messages && messages.length > 0) || isIncognitoRoute"
        tone="neutral"
        icon="mdi:incognito"
        class="incognito-indicator"
      >
        {{ isIncognitoRoute ? 'Incognito Mode' : 'Incognito mode' }}
      </UiBadge>

      <div class="action-toggles">
        <UiTooltip content="Search and commands" side="bottom" shortcut="mod+k">
          <UiIconButton
            icon="material-symbols:search"
            label="Search and commands"
            @click="$emit('open-palette')"
          />
        </UiTooltip>

        <UiTooltip v-if="canExport" content="Export this chat" side="bottom">
          <UiIconButton
            icon="material-symbols:download"
            label="Export this chat"
            @click="$emit('export-chat')"
          />
        </UiTooltip>

        <UiTooltip
          v-if="showIncognitoButton && !isIncognitoRoute"
          :content="isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'"
          side="bottom"
          shortcut="mod+alt+i"
        >
          <UiIconButton
            icon="mdi:incognito"
            :label="isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'"
            togglable
            :active="isIncognito"
            @click="$emit('toggle-incognito')"
          />
        </UiTooltip>

        <UiTooltip v-if="!parameterConfigOpen" content="Model parameters" side="bottom" shortcut="mod+alt+b">
          <UiIconButton
            icon="material-symbols:tune"
            label="Model parameters"
            @click="$emit('toggle-parameter-config')"
          />
        </UiTooltip>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
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
  },
  conversationId: {
    type: String,
    default: "",
  },
  canExport: {
    type: Boolean,
    default: false,
  }
});

defineEmits(['toggle-incognito', 'toggle-parameter-config', 'export-chat', 'open-palette']);

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
/* The bar itself is defined in base.css (.top-bar / .top-bar-content) so the
   translucent treatment stays in one place. Only layout lives here. */
.top-bar {
  position: sticky;
  top: 0;
}

.incognito-indicator {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.action-toggles {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
</style>
