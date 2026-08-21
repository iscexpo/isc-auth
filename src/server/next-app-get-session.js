/**
 * App Router (Next.js 13+) server-side session helper.
 *
 * The universal `getSession` in `../client` reads the session cookie from a
 * `req` object (`req.headers.cookie`), which does not exist in React Server
 * Components. This wrapper pulls the cookie from `next/headers` and forwards it
 * to the existing `getSession` implementation, so the same API works in the
 * App Router without duplicating any session logic.
 */
import { cookies } from 'next/headers'
import { getSession as getSessionUniversal } from '../client'

/**
 * Get the session on the server under the App Router.
 *
 * @param {object} [options] Same options as the universal `getSession`
 *   (`triggerEvent`, etc.). `req`/`ctx` are filled in automatically.
 * @returns {Promise<object|null>}
 */
export async function getSession (options = {}) {
  const store = await cookies()
  const cookie = store.toString()
  return getSessionUniversal({ ...options, req: { headers: { cookie } } })
}

// Common alias used by NextAuth-style integrations.
export const getServerSession = getSession
