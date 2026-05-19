export default defineRouteMiddleware(async (to, from) => {
  // Skip auth check for login page
  if (to.path === '/login') {
    return
  }

  const { isAuthenticated, initAuth } = useAuth()

  // Initialize auth if not already done
  if (!isAuthenticated.value) {
    await initAuth()
  }

  // If still not authenticated, redirect to login
  if (!isAuthenticated.value) {
    return navigateTo('/login')
  }
})
