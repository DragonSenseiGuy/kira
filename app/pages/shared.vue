<script setup>
import { computed } from "vue";
import { useDark } from "@vueuse/core";
import { untrustedMd } from "~/utils/markdown";
import { decodeShare } from "~/utils/shareLink";

definePageMeta({ layout: false });

// The default layout is where the app applies dark mode; this page opts out of it.
useDark();

const route = useRoute();
const shared = computed(() => decodeShare(route.hash));
const title = computed(() => shared.value?.title || "Shared chat");

useHead({ title: () => `${title.value} · Kira` });
</script>

<template>
  <main class="shared-page">
    <header class="shared-header">
      <p class="shared-label">Shared chat · read-only copy</p>
      <h1 v-if="shared">{{ title }}</h1>
    </header>

    <template v-if="shared">
      <article
        v-for="(message, index) in shared.messages"
        :key="index"
        class="shared-turn"
        :class="message.role"
      >
        <h2 class="shared-role">{{ message.role === "user" ? "User" : "Kira" }}</h2>
        <div v-if="message.role === 'user'" class="shared-user-text">{{ message.text }}</div>
        <div v-else class="markdown-content" v-html="untrustedMd.render(message.text)"></div>
      </article>
    </template>
    <div v-else class="shared-invalid">
      <h1>This share link can't be opened</h1>
      <p>It is incomplete or was changed after it was copied. Ask the sender for a new link.</p>
    </div>

    <footer class="shared-footer">
      <NuxtLink to="/">Open Kira</NuxtLink>
    </footer>
  </main>
</template>

<style scoped>
.shared-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 20px 64px;
  color: var(--text-primary);
  min-height: 100vh;
  box-sizing: border-box;
}

.shared-label {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.shared-header h1,
.shared-invalid h1 {
  margin: 0 0 24px;
  font-size: 1.5rem;
  overflow-wrap: anywhere;
}

.shared-turn {
  margin-bottom: 24px;
  overflow-wrap: anywhere;
}

.shared-role {
  margin: 0 0 6px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.shared-turn.user .shared-user-text {
  white-space: pre-wrap;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--color-bubble-user-bg);
  color: var(--color-bubble-user-text);
}

.shared-turn :deep(pre) {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--code-bg);
  overflow-x: auto;
}

.shared-invalid p {
  color: var(--text-secondary);
}

.shared-footer {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 0.9rem;
}

.shared-footer a {
  color: var(--text-secondary);
}
</style>
