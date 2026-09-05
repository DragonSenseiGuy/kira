<template>
  <Teleport to="body">
    <div v-if="pending" class="nc-overlay" role="dialog" aria-label="Network permission request">
      <div class="nc-card">
        <div class="nc-head">
          <Icon icon="material-symbols:public-rounded" width="20" height="20" />
          <strong>Sandbox wants network access</strong>
        </div>
        <p class="nc-domain">
          <code>{{ pending.domain }}</code>
        </p>
        <p class="nc-url">{{ pending.url }}</p>
        <label class="nc-remember">
          <input v-model="remember" type="checkbox" />
          Always allow this domain
        </label>
        <div class="nc-actions">
          <button type="button" class="nc-btn" @click="answer(false)">Deny</button>
          <button type="button" class="nc-btn primary" @click="answer(true)">Allow</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * Global host for sandbox network-consent prompts. The decision logic lives
 * in composables/sandboxNet.js; this component only renders the question.
 * If no host is mounted, sandboxNet falls back to window.confirm().
 */
import { ref, onMounted, onBeforeUnmount } from "vue";
import { Icon } from "@iconify/vue";
import { emitter } from "~/composables/emitter";

const pending = ref(null);
const remember = ref(true);

function onRequest({ url, domain, answer }) {
  pending.value = { url, domain };
  pending.value.answer = answer;
}

function answer(allowed) {
  if (pending.value) {
    window.__libreNetRemember = remember.value;
    pending.value.answer(allowed);
    window.__libreNetRemember = false;
  }
  pending.value = null;
  remember.value = true;
}

onMounted(() => emitter.on("net-consent-request", onRequest));
onBeforeUnmount(() => emitter.off("net-consent-request", onRequest));
</script>

<style scoped>
.nc-overlay {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2000;
}
.nc-card {
  width: 320px;
  background: var(--bg, #fff);
  color: var(--text-primary, inherit);
  border: 1px solid var(--border, rgba(128,128,128,.35));
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.22);
  padding: 14px;
}
.nc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: .9rem;
}
.nc-domain { margin: 10px 0 4px; }
.nc-domain code {
  background: var(--bg-secondary, rgba(128,128,128,.12));
  padding: 2px 8px;
  border-radius: 6px;
  font-size: .82rem;
}
.nc-url {
  margin: 4px 0 10px;
  font-size: .72rem;
  color: var(--text-secondary, gray);
  word-break: break-all;
  max-height: 54px;
  overflow: hidden;
}
.nc-remember {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: .78rem;
  margin-bottom: 12px;
}
.nc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.nc-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(128,128,128,.35));
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: .8rem;
}
.nc-btn.primary {
  background: var(--primary, #7c5cff);
  border-color: transparent;
  color: #fff;
}
</style>
