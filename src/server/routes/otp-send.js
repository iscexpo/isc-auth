import logger from '../../lib/logger'
import { jsonOk, jsonError } from '../internal/respond-json'
import { createRateLimiter } from '../internal/rate-limit'
import { AuthError, RateLimitedError } from '../../lib/errors'
import { normalizePhone } from '../../lib/validation'
import { generateOtp } from '../../lib/otp'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

function _clientIp (req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  return req.connection?.remoteAddress || 'unknown'
}

/**
 * Handle requests to POST /api/auth/otp/send
 *
 * Generates a one-time code and sends it to the given phone number via the
 * Phone provider's sendVerificationRequest() function. Responds with JSON.
 *
 * Body: { phone, csrfToken }
 * Response 200: { ok: true, expiresIn }
 * Response 4xx: { error: { code, message } }
 */
export default async function otpSend (req, res) {
  const {
    adapter,
    providers,
    secret,
    otp: otpOptions
  } = req.options

  const provider = providers.find(({ id, type }) => id === 'phone' && type === 'phone')
  const options = otpOptions ?? {}

  if (!adapter || !provider) {
    logger.error('OTP_REQUIRES_ADAPTER_AND_PHONE_PROVIDER_ERROR')
    return jsonError(res, new AuthError('CONFIGURATION_ERROR', 500, 'Phone OTP requires a database adapter and the Phone provider'))
  }

  if (typeof provider.sendVerificationRequest !== 'function') {
    logger.error('SMS_SEND_NOT_CONFIGURED')
    return jsonError(res, new AuthError('CONFIGURATION_ERROR', 500, 'The Phone provider requires a sendVerificationRequest function'))
  }

  const phone = normalizePhone(req.body.phone)
  if (!phone) {
    return jsonError(res, new AuthError('INVALID_PHONE', 400, 'A valid phone number in E.164 format is required'))
  }

  // Rate limits (per process unless a custom store is provided):
  // - resend cooldown per number
  // - hourly cap per number
  // - hourly cap per IP
  const limits = options.rateLimits ?? {}
  const store = options.store
  const checks = [
    [createRateLimiter({ max: 1, windowMs: (limits.resendCooldownSeconds ?? 30) * 1000, store }), `otp:cooldown:${phone}`],
    [createRateLimiter({ max: limits.maxPerPhonePerHour ?? 5, windowMs: HOUR, store }), `otp:phone-hour:${phone}`],
    [createRateLimiter({ max: limits.maxPerIpPerHour ?? 20, windowMs: HOUR, store }), `otp:ip-hour:${_clientIp(req)}`]
  ]
  for (const [limiter, key] of checks) {
    if (!limiter.check(key).allowed) {
      return jsonError(res, new RateLimitedError())
    }
  }

  try {
    const { createVerificationRequest } = await adapter.getAdapter(req.options)

    // The adapter stores a salted hash of the code as a verification request
    // and invokes provider.sendVerificationRequest({ identifier: phone,
    // token: code, … }) to deliver it. A newer request replaces any older
    // one for the same number.
    await createVerificationRequest(phone, '', generateOtp(), secret, provider)

    return jsonOk(res, { ok: true, expiresIn: provider.maxAge ?? 300 })
  } catch (error) {
    logger.error('OTP_SEND_ERROR', error)
    return jsonError(res, new AuthError('SMS_SEND_FAILED', 500, 'Unable to send the verification code'))
  }
}
