// In-memory session store for password auth
const sessions = new Map()

export function createSession() {
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36)
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  sessions.set(token, { expiresAt })
  return token
}

export function validateSession(token) {
  const session = sessions.get(token)

  if (!session) {
    return false
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token)
    return false
  }

  return true
}
