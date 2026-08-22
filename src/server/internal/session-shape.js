/**
 * Session payload shape conversion (Better Auth compatibility).
 *
 * The native v3 session response shape is flat:
 *   { user: { name, email, image }, expires, accessToken? }
 *
 * Better Auth nests the session metadata under a `session` key:
 *   { user, session: { expires, accessToken? } }
 *
 * The mapping is applied to the JSON response only - callbacks and events
 * keep receiving the original v3 shaped payload so user code is unaffected.
 */

/**
 * Convert a v3 shaped session payload to the Better Auth shape.
 * Returns null when there is no signed-in session (v3 returns `{}`).
 */
export const toBetterAuthSession = (payload) => {
  if (!payload || !payload.user) { return null }

  const { user, expires, accessToken } = payload

  return {
    user,
    session: {
      ...(expires ? { expires } : {}),
      ...(accessToken ? { accessToken } : {})
    }
  }
}

/**
 * Apply the Better Auth session shape if `compat.betterAuth` is enabled,
 * otherwise return the payload unchanged.
 */
export const applyCompatSessionShape = (payload, compat) => {
  if (!(compat && compat.betterAuth)) { return payload }
  return toBetterAuthSession(payload)
}
