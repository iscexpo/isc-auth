import logger from '../lib/logger'

/**
 * Phone provider for one-time-code (OTP) sign up / sign in over SMS.
 *
 * Mirrors the Email provider: the adapter persists a hashed OTP as a
 * verification request and invokes sendVerificationRequest() to deliver it.
 * Provide your own SMS gateway via `sendVerificationRequest`:
 *
 *   Providers.Phone({
 *     sendVerificationRequest: ({ identifier: phone, token: code }) =>
 *       twilio.messages.create({ to: phone, body: `${code} is your code` })
 *   })
 *
 * Requires a database adapter. Endpoints:
 *   POST /api/auth/otp/send    { phone }
 *   POST /api/auth/otp/verify  { phone, code }
 */
export default (options) => {
  return {
    id: 'phone',
    type: 'phone',
    name: 'Phone',
    // How long the OTP remains valid, in seconds (default 5 minutes)
    maxAge: 5 * 60,
    sendVerificationRequest,
    ...options
  }
}

const sendVerificationRequest = ({ identifier: phone }) => {
  logger.error('SMS_SEND_NOT_CONFIGURED', 'Provide a sendVerificationRequest function in the Phone provider options')
  return Promise.reject(new Error('SMS_SEND_NOT_CONFIGURED'))
}
