import * as cookie from '../internal/cookie'
import logger from '../../lib/logger'
import dispatchEvent from '../internal/dispatch-event'
import { jsonOk, jsonError } from '../internal/respond-json'
import { createRateLimiter } from '../internal/rate-limit'
import { AuthError, InvalidTokenError, RateLimitedError } from '../../lib/errors'
import { normalizePhone } from '../../lib/validation'
import publicProfile from '../internal/public-profile'

const MINUTE = 60 * 1000

/**
 * Handle requests to POST /api/auth/otp/verify
 *
 * Verifies the one-time code sent to a phone number and either signs the
 * user in or creates a new account for that number (sign up + sign in).
 * Responds with JSON.
 *
 * Body: { phone, code, csrfToken }
 * Response 200: { user }
 * Response 4xx: { error: { code, message } }
 */
export default async function otpVerify (req, res) {
  const {
    adapter,
    providers,
    secret,
    cookies,
    events,
    callbacks,
    jwt,
    otp: otpOptions
  } = req.options

  const useJwtSession = req.options.session.jwt
  const sessionMaxAge = req.options.session.maxAge

  const provider = providers.find(({ id, type }) => id === 'phone' && type === 'phone')
  if (!adapter || !provider) {
    logger.error('OTP_REQUIRES_ADAPTER_AND_PHONE_PROVIDER_ERROR')
    return jsonError(res, new AuthError('CONFIGURATION_ERROR', 500, 'Phone OTP requires a database adapter and the Phone provider'))
  }

  const phone = normalizePhone(req.body.phone)
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : ''
  if (!phone) {
    return jsonError(res, new AuthError('INVALID_PHONE', 400, 'A valid phone number in E.164 format is required'))
  }
  if (!/^\d{4,10}$/.test(code)) {
    return jsonError(res, new InvalidTokenError('Invalid verification code'))
  }

  // Throttle verification attempts per number to blunt brute force attacks;
  // codes are single-use and short-lived on top of this.
  const options = otpOptions ?? {}
  const limiter = createRateLimiter({
    max: options.rateLimits?.maxVerifyAttempts ?? 5,
    windowMs: (options.rateLimits?.verifyWindowMinutes ?? 15) * MINUTE,
    store: options.store
  })
  if (!limiter.check(`otp:verify:${phone}`).allowed) {
    return jsonError(res, new RateLimitedError())
  }

  try {
    const {
      getVerificationRequest,
      deleteVerificationRequest,
      getUserByPhone,
      createUser,
      updateUser,
      createSession
    } = await adapter.getAdapter(req.options)

    const verificationRequest = await getVerificationRequest(phone, code, secret, provider)
    if (!verificationRequest) {
      return jsonError(res, new InvalidTokenError('Invalid or expired verification code'))
    }

    // Codes are single use - delete so it cannot be verified again
    await deleteVerificationRequest(phone, code, secret, provider)

    // Find or create the user for this phone number
    let user = await getUserByPhone(phone)
    let isNewUser = false
    if (user) {
      if (!user.phoneVerified) {
        user = await updateUser({ ...user, phoneVerified: new Date() })
        await dispatchEvent(events.updateUser, user)
      }
    } else {
      user = await createUser({ name: null, email: null, image: null, phone, phoneVerified: new Date() })
      isNewUser = true
      await dispatchEvent(events.createUser, user)
    }

    // Check if user is allowed to sign in
    const account = { id: 'phone', type: 'phone' }
    const signInCallbackResponse = await callbacks.signIn(user, account, { phone })
    if (signInCallbackResponse === false) {
      return jsonError(res, new AuthError('ACCESS_DENIED', 403, 'Sign in was not allowed'))
    }

    // Create the session (mirrors routes/callback.js)
    if (useJwtSession) {
      const defaultJwtPayload = {
        name: user.name,
        email: user.email,
        picture: user.image,
        sub: `${user.id}`
      }
      const jwtPayload = await callbacks.jwt(defaultJwtPayload, user, account)

      // Sign and encrypt token
      const newEncodedJwt = await jwt.encode({ ...jwt, token: jwtPayload })

      // Set cookie expiry date
      const cookieExpires = new Date()
      cookieExpires.setTime(cookieExpires.getTime() + (sessionMaxAge * 1000))

      cookie.set(res, cookies.sessionToken.name, newEncodedJwt, { expires: cookieExpires.toISOString(), ...cookies.sessionToken.options })
    } else {
      const session = await createSession(user)

      // Save Session Token in cookie
      cookie.set(res, cookies.sessionToken.name, session.sessionToken, { expires: session.expires || null, ...cookies.sessionToken.options })
    }

    await dispatchEvent(events.signIn, { user, account, isNewUser })

    return jsonOk(res, { user: publicProfile(user) })
  } catch (error) {
    logger.error('OTP_VERIFY_ERROR', error)
    return jsonError(res, error)
  }
}
