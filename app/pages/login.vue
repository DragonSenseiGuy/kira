<template>
  <div class="login-container">
    <div class="login-box">
      <h1>Kira</h1>
      <p class="subtitle">Enter the password to continue</p>

      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <input
            v-model="password"
            type="password"
            placeholder="Password"
            @keyup.enter="handleLogin"
            autofocus
          />
        </div>

        <button type="submit" :disabled="isLoading">
          {{ isLoading ? 'Authenticating...' : 'Enter' }}
        </button>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: false
})

const router = useRouter()
const { login, isAuthenticated, initAuth } = useAuth()

const password = ref('')
const error = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  error.value = ''
  isLoading.value = true

  try {
    const result = await login(password.value)

    if (result.success) {
      await router.push('/')
    } else {
      error.value = result.error
    }
  } catch (err) {
    error.value = 'An error occurred. Please try again.'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await initAuth()
  if (isAuthenticated.value) {
    await router.push('/')
  }
})
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100vw;
  height: 100dvh;
  background: var(--bg);
  color: var(--text-primary);
}

.login-box {
  width: 100%;
  max-width: 400px;
  padding: 40px 30px;
  border-radius: 16px;
  background: var(--bg-secondary);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
}

h1 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
}

.subtitle {
  margin: 0 0 30px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

input {
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s;
  font-family: inherit;
}

input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(203, 166, 247, 0.1);
}

input::placeholder {
  color: var(--text-secondary);
}

button[type="submit"] {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

button[type="submit"]:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-message {
  padding: 12px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 13px;
  text-align: center;
}
</style>
