<template>
  <div class="auth-page">
    <div class="auth-card">
      <header class="auth-header">
        <Icon icon="ph:sparkle-fill" class="auth-mark" width="22" height="22" />
        <h1 class="auth-title">{{ isRegistering ? "Create your account" : "Welcome back" }}</h1>
        <p class="auth-subtitle">
          {{
            isRegistering
              ? "Your chats are saved to your account, so they follow you between devices."
              : "Sign in to pick up your chats where you left off."
          }}
        </p>
      </header>

      <UiSegmented
        v-model="mode"
        class="auth-mode"
        aria-label="Sign in or create an account"
        :options="modeOptions"
      />

      <form class="auth-form" @submit.prevent="submit">
        <UiInput
          v-model="email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          autocomplete="email"
          icon="ph:envelope-simple"
          required
          :disabled="loading"
        />

        <UiInput
          v-model="password"
          type="password"
          label="Password"
          :placeholder="isRegistering ? 'At least 8 characters' : '••••••••'"
          :autocomplete="isRegistering ? 'new-password' : 'current-password'"
          icon="ph:lock-simple"
          :minlength="isRegistering ? MIN_PASSWORD_LENGTH : undefined"
          required
          :disabled="loading"
        />

        <p v-if="error" class="auth-error" role="alert">
          <Icon icon="ph:warning-circle" width="14" height="14" />
          {{ error }}
        </p>

        <UiButton type="submit" variant="primary" size="lg" block :loading="loading">
          {{ isRegistering ? "Create account" : "Sign in" }}
        </UiButton>
      </form>

      <p class="auth-footnote">
        Passwords are stored as salted hashes — never in plain text.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useAuth } from "~/composables/useAuth";

definePageMeta({ layout: false });

const MIN_PASSWORD_LENGTH = 8;

const route = useRoute();
const { login, register } = useAuth();

const mode = ref("signin");
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

const isRegistering = computed(() => mode.value === "signup");

const modeOptions = [
  { value: "signin", label: "Sign in" },
  { value: "signup", label: "Sign up" },
];

// A stale "invalid email or password" under the sign-up tab is just confusing.
watch(mode, () => {
  error.value = "";
});

async function submit() {
  if (loading.value) return;

  error.value = "";

  if (isRegistering.value && password.value.length < MIN_PASSWORD_LENGTH) {
    error.value = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    return;
  }

  loading.value = true;
  const result = isRegistering.value
    ? await register(email.value, password.value)
    : await login(email.value, password.value);
  loading.value = false;

  if (!result.success) {
    error.value = result.error;
    return;
  }

  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
  await navigateTo(redirect, { replace: true });
}
</script>

<style scoped>
.auth-page {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 24px;
  background: var(--bg);
}

.auth-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px;
  background: var(--card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-raised);
}

.auth-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-mark {
  color: var(--accent);
  margin-bottom: 2px;
}

.auth-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.auth-subtitle {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.auth-mode {
  align-self: stretch;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.78rem;
  color: var(--danger);
}

.auth-footnote {
  margin: 0;
  font-size: 0.72rem;
  text-align: center;
  color: var(--text-muted);
}
</style>
