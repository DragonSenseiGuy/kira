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
          @auxclick="handleMiddleClickNewChat"
        />
      </UiTooltip>

      <UiBadge
        v-if="(isIncognito && messages && messages.length > 0) || isIncognitoSession"
        tone="neutral"
        icon="mdi:incognito"
        class="incognito-indicator"
      >
        Incognito mode
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
          v-if="showIncognitoButton && !isIncognitoSession"
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

        <UiTooltip
          v-if="showParametersButton && !parameterConfigOpen"
          content="Model parameters"
          side="bottom"
          shortcut="mod+alt+b"
        >
          <UiIconButton
            icon="material-symbols:tune"
            label="Model parameters"
            @click="$emit('toggle-parameter-config')"
          />
        </UiTooltip>

        <UiTooltip v-if="!workspaceOpen" content="Workspace files" side="bottom">
          <UiIconButton
            icon="material-symbols:folder-open-outline-rounded"
            label="Workspace files"
            @click="$emit('toggle-workspace')"
          />
        </UiTooltip>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from "vue-router";
import { useGlobalIncognito } from "~/composables/useGlobalIncognito";

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
  // Model parameters are a Developer Mode feature; the layout owns the flag.
  showParametersButton: {
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
  workspaceOpen: {
    type: Boolean,
    default: false
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

defineEmits(['toggle-incognito', 'toggle-parameter-config', 'toggle-workspace', 'export-chat', 'open-palette']);

const router = useRouter();
const topBarRef = ref(null);

const handleNewChat = () => {
  router.push('/');
};

const handleMiddleClickNewChat = (e) => {
  if (e.button === 1) {
    e.preventDefault();
    window.open('/', '_blank');
  }
};

// The incognito screen itself, as opposed to incognito merely armed from
// the new-chat toggle — the badge and the toggle button read differently there.
const { isIncognitoSession } = useGlobalIncognito();

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
