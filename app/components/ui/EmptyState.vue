<template>
  <div class="ui-empty">
    <div v-if="icon" class="ui-empty__icon">
      <Icon :icon="icon" width="24" height="24" />
    </div>
    <p class="ui-empty__title">{{ title }}</p>
    <p v-if="description" class="ui-empty__desc">{{ description }}</p>
    <div v-if="$slots.default" class="ui-empty__actions">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { Icon } from "@iconify/vue";

defineProps({
  icon: { type: String, default: "" },
  title: { type: String, required: true },
  description: { type: String, default: "" },
});
</script>

<style scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 32px 20px;
  text-align: center;
}

.ui-empty__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 4px;
  color: var(--text-muted);
  background: var(--field);
  border-radius: var(--radius-full);
}

.ui-empty__title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.ui-empty__desc {
  margin: 0;
  max-width: 40ch;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.ui-empty__actions {
  margin-top: 10px;
}
</style>
