import { ref, computed } from 'vue'

const isAuthenticated = ref(false)

export const useAuth = () => {
  const initAuth = async () => {
    // Check if auth is enabled (password is set on server)
    try {
      const response = await fetch('/api/auth/status')
      const data = await response.json()

      if (!data.authEnabled) {
        // No password set, allow access
        isAuthenticated.value = true
        return
      }

      // Check if user has auth token in localStorage
      const token = localStorage.getItem('auth_token')
      if (token) {
        // Verify token with server
        const verifyResponse = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
        isAuthenticated.value = verifyResponse.ok
      }
    } catch (error) {
      console.error('Auth initialization error:', error)
    }
  }

  const login = async (password) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('auth_token', data.token)
        isAuthenticated.value = true
        return { success: true }
      } else {
        const data = await response.json()
        return { success: false, error: data.error || 'Invalid password' }
      }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, error: error.message }
    }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    isAuthenticated.value = false
  }

  return {
    isAuthenticated: computed(() => isAuthenticated.value),
    initAuth,
    login,
    logout
  }
}
