import logger from '../../lib/logger'
import { jsonOk, jsonError } from '../internal/respond-json'
import { AuthError, InvalidPasswordError, WeakPasswordError } from '../../lib/errors'
import { hashPassword, verifyPassword } from '../../lib/password'
import { checkPassword } from '../../lib/validation'

/**
 * Resolve the signed-in user from the session cookie (JWT or DB backed).
 * Returns null when there is no valid session.
 */
async function _getSessionUser (req) {
  const {
    adapter,
    cookies,
    jwt,
    session: { jwt: useJwtSession }
  } = req.options

  const sessionToken = req.cookies?.[cookies.sessionToken.name]
  if (!sessionToken) { return null }

  const { getUser, getSession } = await adapter.getAdapter(req.options)

  if (useJwtSession) {
    try {
      const decoded = await jwt.decode({ ...jwt, token: sessionToken })
      if (decoded?.sub) { return getUser(decoded.sub) }
    } catch (error) {
      logger.debug('CHANGE_PASSWORD_JWT_DECODE_ERROR', error)
      return null
    }
    return null
  }

  const session = await getSession(sessionToken)
  if (session?.userId) { return getUser(session.userId) }
  return null
}

/**
 * Handle requests to POST /api/auth/password/change
 *
 * Changes the password of the currently signed-in user. Responds with JSON.
 *
 * Body: { currentPassword, newPassword, csrfToken }
 * Response 200: { ok: true }
 * Response 4xx: { error: { code, message } }
 */
export default async function changePassword (req, res) {
  const { adapter } = req.options

  if (!adapter) {
    logger.error('PASSWORD_CHANGE_REQUIRES_ADAPTER_ERROR')
    return jsonError(res, new AuthError('CONFIGURATION_ERROR', 500, 'Changing passwords requires a database adapter'))
  }

  try {
    const user = await _getSessionUser(req)
    if (!user) {
      return jsonError(res, new AuthError('UNAUTHENTICATED', 401, 'You must be signed in to change your password'))
    }

    // Users created via OAuth/email-link only have no password set
    if (!user.passwordHash || !(await verifyPassword(req.body.currentPassword ?? '', user.passwordHash))) {
      return jsonError(res, new InvalidPasswordError('Current password is incorrect'))
    }

    const newPasswordProblem = checkPassword(req.body.newPassword)
    if (newPasswordProblem) {
      return jsonError(res, new WeakPasswordError(newPasswordProblem))
    }

    const { updateUser } = await adapter.getAdapter(req.options)
    await updateUser({ ...user, passwordHash: await hashPassword(req.body.newPassword) })

    return jsonOk(res, { ok: true })
  } catch (error) {
    logger.error('PASSWORD_CHANGE_ERROR', error)
    return jsonError(res, error)
  }
}
