<template>
  <div class="ui-card" :class="[`ui-card--${elevation}`, { 'ui-card--pad': padded, 'ui-card--hover': interactive }]">
    <header v-if="$slots.header || title" class="ui-card__header">
      <slot name="header">
        <span class="ui-card__title">{{ title }}</span>
        <span v-if="description" class="ui-card__desc">{{ description }}</span>
      </slot>
    </header>
    <div class="ui-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="ui-card__footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  /** Matches the surface ladder in base.css: inset < card < overlay. */
  elevation: {
    type: String,
    default: "card",
    validator: (v) => ["flat", "card", "raised", "overlay"].includes(v),
  },
  padded: { type: Boolean, default: true },
  interactive: { type: Boolean, default: false },
});
</script>

<style scoped>
.ui-card {
  background: var(--card);
  border-radius: var(--radius-card);
  overflow: hidden;
  transition: box-shadow var(--duration) var(--ease-out);
}

.ui-card--flat {
  background: var(--inset);
  box-shadow: var(--shadow-hairline);
}

.ui-card--card {
  box-shadow: var(--shadow-card);
}

.ui-card--raised {
  box-shadow: var(--shadow-raised);
}

.ui-card--overlay {
  box-shadow: var(--shadow-overlay);
}

.ui-card--hover:hover {
  box-shadow: var(--shadow-raised);
}

.ui-card__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.ui-card__title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
}

.ui-card__desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.ui-card--pad .ui-card__body {
  padding: 14px;
}

.ui-card__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--inset);
}
</style>
