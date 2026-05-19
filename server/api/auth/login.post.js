import { createSession } from '~/server/utils/authSessions'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.appPassword) {
    return sendError(
      event,
      createError({ statusCode: 400, statusMessage: 'Authentication not enabled' })
    )
  }

  const body = await readBody(event)
  const { password } = body

  if (!password) {
    return sendError(
      event,
      createError({ statusCode: 400, statusMessage: 'Password is required' })
    )
  }

  if (password !== config.appPassword) {
    return sendError(
      event,
      createError({ statusCode: 401, statusMessage: 'Invalid password' })
    )
  }

  // Generate a session token
  const token = createSession()

  return {
    success: true,
    token
  }
})
