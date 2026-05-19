import { validateSession } from '~/server/utils/authSessions'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.appPassword) {
    // Auth not enabled, always allow
    return { valid: true }
  }

  const body = await readBody(event)
  const { token } = body

  if (!token) {
    return sendError(
      event,
      createError({ statusCode: 401, statusMessage: 'Token is required' })
    )
  }

  if (!validateSession(token)) {
    return sendError(
      event,
      createError({ statusCode: 401, statusMessage: 'Invalid or expired token' })
    )
  }

  return { valid: true }
})
