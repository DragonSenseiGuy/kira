<template>
  <DialogRoot :open="!!image" @update:open="(open) => { if (!open) $emit('close'); }">
    <DialogPortal>
      <DialogOverlay class="lightbox-overlay" />
      <DialogContent class="lightbox" :aria-describedby="undefined" @click.self="$emit('close')">
        <DialogTitle class="lightbox-title">{{ image?.alt || 'Image' }}</DialogTitle>
        <DialogClose as-child>
          <button type="button" class="lightbox-close" aria-label="Close image">
            <Icon icon="material-symbols:close-rounded" width="22" height="22" />
          </button>
        </DialogClose>
        <img v-if="image" class="lightbox-image" :src="image.src" :alt="image.alt || ''" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup>
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from "reka-ui";
import { Icon } from "@iconify/vue";

defineProps({
  // { src, alt } of the image to show, or null when closed.
  image: { type: Object, default: null },
});

defineEmits(["close"]);
</script>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: rgba(0, 0, 0, 0.82);
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1401;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px 16px;
  outline: none;
}

.lightbox-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.lightbox-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-control);
}

.lightbox-close {
  position: absolute;
  top: 10px;
  right: 12px;
  display: inline-flex;
  padding: 6px;
  border: none;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
}

.lightbox-close:hover,
.lightbox-close:focus-visible {
  background: rgba(255, 255, 255, 0.28);
}
</style>
