<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="ui-dialog__overlay" />
      <DialogContent class="ui-dialog dialog-content-panel" :class="[`ui-dialog--${size}`]">
        <header class="ui-dialog__header">
          <div class="ui-dialog__heading">
            <DialogTitle class="ui-dialog__title">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="ui-dialog__desc">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <UiIconButton icon="material-symbols:close-rounded" label="Close" size="sm" />
          </DialogClose>
        </header>

        <div class="ui-dialog__body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="ui-dialog__footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup>
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  size: {
    type: String,
    default: "md",
    validator: (v) => ["sm", "md", "lg", "full"].includes(v),
  },
});

defineEmits(["update:open"]);
</script>

<style scoped>
.ui-dialog__overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(2px);
  z-index: 1400;
  animation: uFade var(--duration) var(--ease-out) both;
}

.ui-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  width: calc(100vw - 32px);
  max-height: min(84dvh, 760px);
  background: var(--card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-overlay);
  z-index: 1401;
  overflow: hidden;
  animation: uDialogIn var(--duration-enter) var(--ease-out-strong) both;
}

.ui-dialog--sm {
  max-width: 380px;
}

.ui-dialog--md {
  max-width: 520px;
}

.ui-dialog--lg {
  max-width: 760px;
}

.ui-dialog--full {
  max-width: 1000px;
  height: min(84dvh, 760px);
}

.ui-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 16px 12px;
  flex-shrink: 0;
}

.ui-dialog__heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ui-dialog__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.ui-dialog__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.ui-dialog__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.ui-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--inset);
  flex-shrink: 0;
}

@keyframes uFade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes uDialogIn {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>
