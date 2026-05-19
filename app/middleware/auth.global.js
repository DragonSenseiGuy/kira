import { useAuth } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware(async (to, from) => {
  if (to.path === '/login') {
    return
  }

  const { isAuthenticated, initAuth } = useAuth()

  if (!isAuthenticated.value) {
    await initAuth()
  }

  if (!isAuthenticated.value) {
    return navigateTo('/login')
  }
})
