<template>
  <!-- A div, not a button: the favourite star is a real button and nesting one
       button inside another is invalid HTML that Vue warns about and that can
       break hydration. Keyboard behaviour is restored explicitly. -->
  <div
    class="mpr-row"
    :class="{ selected }"
    role="button"
    tabindex="0"
    :aria-pressed="String(selected)"
    @click="$emit('select')"
    @keydown.enter.prevent="$emit('select')"
    @keydown.space.prevent="$emit('select')"
  >
    <div class="mpr-main">
      <div class="mpr-name-line">
        <span class="mpr-name">{{ model.name }}</span>
        <span
          v-if="model.vision"
          class="mpr-tag"
          title="Supports image input"
          aria-label="Vision"
        >
          <Icon icon="material-symbols:visibility-outline-rounded" width="12" height="12" />
        </span>
        <span
          v-if="model.tool_use"
          class="mpr-tag"
          title="Supports tool use"
          aria-label="Tools"
        >
          <Icon icon="material-symbols:build-outline-rounded" width="12" height="12" />
        </span>
      </div>
      <!-- Single line, ellipsized: long words/links can never break the layout -->
      <span v-if="model.description" class="mpr-description">{{ model.description }}</span>
    </div>

    <button
      type="button"
      class="mpr-star"
      :class="{ active: favorite }"
      :aria-label="favorite ? 'Remove from favorites' : 'Add to favorites'"
      :title="favorite ? 'Remove from favorites' : 'Add to favorites'"
      @click.stop="$emit('toggle-favorite')"
    >
      <Icon
        :icon="favorite ? 'material-symbols:star-rounded' : 'material-symbols:star-outline-rounded'"
        width="21"
        height="21"
      />
    </button>

    <span v-if="selected" class="mpr-check">
      <Icon icon="material-symbols:check-rounded" width="20" height="20" />
    </span>
  </div>
</template>

<script setup>
import { Icon } from '@iconify/vue';

defineProps({
  model: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  favorite: { type: Boolean, default: false },
});

defineEmits(['select', 'toggle-favorite']);
</script>

<style scoped>
.mpr-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: var(--radius-md, 10px);
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

/* Small gap between consecutive model rows */
.mpr-row + .mpr-row {
  margin-top: 3px;
}

.mpr-row:hover {
  background: var(--btn-hover);
}

.mpr-row.selected {
  background: var(--hover-2);
}

.mpr-main {
  flex: 1;
  min-width: 0;
}

.mpr-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mpr-name {
  font-size: 0.9rem;
  font-weight: 550;
  /* Long ids/words wrap instead of overflowing */
  overflow-wrap: anywhere;
  word-break: break-word;
}

.mpr-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Square: equal padding around the 12px icon */
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--overlay-hover);
  color: var(--text-secondary);
}

.mpr-description {
  display: block;
  margin-top: 2px;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-secondary);
  /* Cut off after one line — descriptions are marketing copy */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Links/long tokens cannot stretch the row */
  overflow-wrap: anywhere;
}

.mpr-star {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease;
}

.mpr-row:hover .mpr-star,
.mpr-star.active {
  opacity: 1;
}

/* Keyboard reachability: reveal the star while the row has focus. */
.mpr-row:focus-visible .mpr-star {
  opacity: 1;
}

/* Touch devices have no hover, so a hover-revealed star is undiscoverable.
   Always render it there — dimmed until favorited — with a larger touch
   target. Desktop keeps the clean hover-only treatment. */
@media (hover: none) {
  .mpr-star {
    opacity: 0.55;
    width: 36px;
    height: 36px;
  }

  /* Sticky tap-hover shouldn't leave rows stuck highlighted */
  .mpr-row:hover {
    background: transparent;
  }

  .mpr-row.selected {
    background: var(--hover-2);
  }
}

.mpr-star:hover {
  color: var(--text-primary);
}

/* Amber-600 in light mode for contrast; brighter gold on dark surfaces */
.mpr-star.active {
  color: #d97706;
}

.dark .mpr-star.active {
  color: #fbbf24;
}

.mpr-check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--text-primary);
}
</style>
