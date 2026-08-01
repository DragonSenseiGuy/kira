<template>
  <TooltipProvider :delay-duration="delay" disable-closing-trigger>
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent class="ui-tooltip" :side="side" :side-offset="6">
          <slot name="content">{{ content }}</slot>
          <UiKbd v-if="shortcut" :keys="shortcut" tone="dark" class="ui-tooltip__kbd" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup>
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent } from "reka-ui";

defineProps({
  content: { type: String, default: "" },
  side: { type: String, default: "top" },
  /** Optional shortcut hint, e.g. "mod+k". Rendered as a key chip. */
  shortcut: { type: String, default: "" },
  delay: { type: Number, default: 350 },
});
</script>

<style scoped>
.ui-tooltip {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 260px;
  padding: 5px 8px;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--tooltip-fg);
  background: var(--tooltip-bg);
  border-radius: var(--radius-chip);
  box-shadow: var(--shadow-overlay);
  z-index: 1200;
  animation: uEnter var(--duration-fast) var(--ease-out-strong) both;
}

.ui-tooltip__kbd {
  margin-left: 2px;
}
</style>
