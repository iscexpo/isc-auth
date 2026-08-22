/**
 * Better Auth style programmatic server-side API.
 *
 * Usage in a configured handler (e.g. pages/api/auth/[...iscauth].js):
 *
 *   import ISCAuth from 'isc-auth'
 *   const auth = ISCAuth({ ...options })
 *   export default auth
 *
 *   // elsewhere on the server:
 *   const { user, session } = await auth.api.getSession({ headers }) ?? {}
 *
 * `headers` may be a Web `Headers` instance or a plain object containing the
 * request cookie header. The session is resolved through the same `/session`
 * endpoint logic used by clients, so adapter, JWT and compat settings all
 * behave identically.
 */
import { getSession as getSessionUniversal } from '../client'

export default function createApi (userOptions = {}) {
  return {
    /**
     * Get the session for a request from its headers.
     *
     * Resolves to null when there is no valid session. When
     * `compat.betterAuth` is enabled the payload uses the Better Auth shape
     * `{ user, session: { expires } }`, otherwise the native v3 shape
     * `{ user, expires }` is returned.
     */
    async getSession ({ headers, req, ctx } = {}) {
      if (!headers) {
        // Support the same calling convention as the universal getSession()
        headers = (req ?? ctx?.req)?.headers
      }

      let cookieHeader = null

      if (headers) {
        cookieHeader = typeof headers.get === 'function'
          ? headers.get('cookie')
          : headers.cookie
      }

      const session = await getSessionUniversal({
        req: { headers: { cookie: cookieHeader } },
        triggerEvent: false
      })

      if (!(session && session.user)) { return null }
      return session
    }
  }
}
