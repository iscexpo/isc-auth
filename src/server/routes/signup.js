import * as cookie from '../internal/cookie'
import logger from '../../lib/logger'
import dispatchEvent from '../internal/dispatch-event'
import { jsonOk, jsonError } from '../internal/respond-json'
import { AuthError, UserExistsError, WeakPasswordError } from '../../lib/errors'
import { hashPassword } from '../../lib/password'
import { isValidEmail, checkPassword } from '../../lib/validation'
import publicProfile from '../internal/public-profile'

/**
 * Handle requests to POST /api/auth/signup/email
 *
 * Creates a new user account with an email address and password. Unlike the
 * legacy redirect-based flows this endpoint always responds with JSON
 * (Better Auth parity).
 *
 * Body: { name?, email, password, csrfToken }
 * Response 200: { user }
 * Response 4xx: { error: { code, message } }
 */
export default async function signup (req, res) {
  const {
    adapter,
    cookies,
    events,
    callbacks,
    jwt,
    password: passwordOptions,
    signup: signupOptions
  } = req.options

  const useJwtSession = req.options.session.jwt
  const sessionMaxAge = req.options.session.maxAge

  if (!adapter) {
    logger.error('SIGNUP_REQUIRES_ADAPTER_ERROR')
    return jsonError(res, new AuthError('CONFIGURATION_ERROR', 500, 'Sign up requires a database adapter'))
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : null
  const password = typeof req.body.password === 'string' ? req.body.password : ''

  if (!isValidEmail(email)) {
    return jsonError(res, new AuthError('INVALID_EMAIL', 400, 'A valid email address is required'))
  }

  // Password policy can be customized via options.password.minLength
  const passwordProblem = checkPassword(password, passwordOptions)
  if (passwordProblem) {
    return jsonError(res, new WeakPasswordError(passwordProblem))
  }

  try {
    const { getUserByEmail, createUser, createSession } = await adapter.getAdapter(req.options)

    const existingUser = await getUserByEmail(email)
    if (existingUser) {
      return jsonError(res, new UserExistsError())
    }

    const user = await createUser({
      name: name || null,
      email,
      image: null,
      passwordHash: await hashPassword(password)
    })
    await dispatchEvent(events.createUser, user)

    // Sign the new user in automatically unless autoSignIn is disabled.
    // This mirrors the session handling in routes/callback.js for credentials.
    let autoSignIn = true
    if (signupOptions && signupOptions.autoSignIn === false) { autoSignIn = false }

    if (autoSignIn) {
      const account = { id: 'signup', type: 'credentials' }

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

      await dispatchEvent(events.signIn, { user, account })
    }

    return jsonOk(res, { user: publicProfile(user) })
  } catch (error) {
    // Handles races where two sign ups pass the getUserByEmail check and the
    // database unique constraint rejects the second insert
    if (error.name === 'CreateUserError') {
      return jsonError(res, new UserExistsError())
    }
    return jsonError(res, error)
  }
}
