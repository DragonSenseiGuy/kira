export default defineEventHandler((event) => {
  const config = useRuntimeConfig()

  return {
    authEnabled: !!config.appPassword
  }
})
