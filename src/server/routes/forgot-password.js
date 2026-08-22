import { randomBytes } from 'crypto'

import logger from '../../lib/logger'
import { jsonOk, jsonError } from '../internal/respond-json'
import { createRateLimiter } from '../internal/rate-limit'
import { AuthError } from '../../lib/errors'
import { isValidEmail } from '../../lib/validation'

const HOUR = 60 * 60 * 1000

function _clientIp (req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.connection?.remoteAddress || 'unknown'
}

/**
 * Handle requests to POST /api/auth/password/forgot
 *
 * Emails a single-use password reset token to the given address (when the
 * account exists and a sendResetRequest function is configured). Always
 * responds { ok: true } so the endpoint cannot be used to enumerate accounts.
 *
 * Body: { email, csrfToken }
 * Response 200: { ok: true }
 */
export default async function forgotPassword (req, res) {
  const {
    adapter,
    secret,
    forgotPassword: forgotPasswordOptions
  } = req.options

  if (!adapter || !forgotPasswordOptions || typeof forgotPasswordOptions.sendResetRequest !== 'function') {
    logger.error('FORGOT_PASSWORD_CONFIGURATION_ERROR')
    return jsonError(res, new AuthError('CONFIGURATION_ERROR', 500, 'Password reset requires an adapter and options.forgotPassword.sendResetRequest'))
  }

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : null
  if (!isValidEmail(email)) {
    // Same response as for unknown accounts - do not leak validity hints
    return jsonOk(res, { ok: true })
  }

  const options = forgotPasswordOptions
  const store = options.store
  const checks = [
    [createRateLimiter({ max: 1, windowMs: (options.resendCooldownSeconds ?? 300) * 1000, store }), `pw:cooldown:${email}`],
    [createRateLimiter({ max: options.maxPerIpPerHour ?? 10, windowMs: HOUR, store }), `pw:ip-hour:${_clientIp(req)}`]
  ]
  for (const [limiter, key] of checks) {
    if (!limiter.check(key).allowed) {
      // Deliberately identical response to the success case
      return jsonOk(res, { ok: true })
    }
  }

  try {
    const { getUserByEmail, createVerificationRequest } = await adapter.getAdapter(req.options)
    const user = await getUserByEmail(email)

    if (user) {
      const token = randomBytes(32).toString('hex')

      // Reuse verification-request storage: hashed at rest with expiry
      // (default 1 hour). The adapter invokes sendResetRequest to deliver.
      const pseudoProvider = {
        maxAge: options.tokenMaxAgeSeconds ?? 3600,
        sendVerificationRequest: options.sendResetRequest
      }
      await createVerificationRequest(email, '', token, secret, pseudoProvider)
    }

    return jsonOk(res, { ok: true })
  } catch (error) {
    logger.error('FORGOT_PASSWORD_ERROR', error)
    // Never leak whether the mailout failed for a specific account
    return jsonOk(res, { ok: true })
  }
}
