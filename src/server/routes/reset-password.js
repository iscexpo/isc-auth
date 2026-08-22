import logger from '../../lib/logger'
import { jsonOk, jsonError } from '../internal/respond-json'
import { AuthError, InvalidTokenError, WeakPasswordError } from '../../lib/errors'
import { hashPassword } from '../../lib/password'
import { checkPassword, isValidEmail } from '../../lib/validation'

/**
 * Handle requests to POST /api/auth/password/reset
 *
 * Consumes a single-use token (from /api/auth/password/forgot) and sets a new
 * password. Responds with JSON.
 *
 * Body: { email, token, newPassword, csrfToken }
 * Response 200: { ok: true }
 * Response 4xx: { error: { code, message } }
 */
export default async function resetPassword (req, res) {
  const { adapter, secret } = req.options

  if (!adapter) {
    logger.error('PASSWORD_RESET_REQUIRES_ADAPTER_ERROR')
    return jsonError(res, new AuthError('CONFIGURATION_ERROR', 500, 'Password reset requires a database adapter'))
  }

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : null
  const token = typeof req.body.token === 'string' ? req.body.token.trim() : ''

  if (!isValidEmail(email) || !token || token.length > 256) {
    return jsonError(res, new InvalidTokenError())
  }

  // Validate the new password before touching the database so bad requests do
  // not consume the single-use token.
  const newPasswordProblem = checkPassword(req.body.newPassword)
  if (newPasswordProblem) {
    return jsonError(res, new WeakPasswordError(newPasswordProblem))
  }

  try {
    const {
      getUserByEmail,
      updateUser,
      getVerificationRequest,
      deleteVerificationRequest
    } = await adapter.getAdapter(req.options)

    // No provider object is needed for verification lookups beyond maxAge
    const request = await getVerificationRequest(email, token, secret, {})
    if (!request) {
      return jsonError(res, new InvalidTokenError())
    }

    const user = await getUserByEmail(email)
    if (!user) {
      return jsonError(res, new InvalidTokenError())
    }

    // Single use - consume the token before making changes
    await deleteVerificationRequest(email, token, secret, {})

    await updateUser({ ...user, passwordHash: await hashPassword(req.body.newPassword) })

    return jsonOk(res, { ok: true })
  } catch (error) {
    logger.error('PASSWORD_RESET_ERROR', error)
    return jsonError(res, error)
  }
}
