/**
 * Shared validation helpers for registration flows
 * (sign up, password change, password reset).
 *
 * Kept dependency-free and side-effect free so they can be unit tested and
 * reused on both client and server.
 */

// Pragmatic email shape check (not full RFC 5322 compliance). The same
// lowercase/normalization convention as the email sign in flow applies:
// email addresses are treated as case-insensitive in practice.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail (email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_REGEX.test(email)
}

/**
 * Check a password against a policy.
 *
 * Returns null if the password is acceptable, otherwise a human readable
 * reason string (suitable to pass to WeakPasswordError).
 */
export function checkPassword (password, { minLength = 8, maxLength = 1024 } = {}) {
  if (typeof password !== 'string' || password.length < minLength) {
    return `Password must be at least ${minLength} characters long`
  }
  // Upper bound protects the scrypt hash step from abuse via huge payloads
  if (password.length > maxLength) {
    return `Password must be no more than ${maxLength} characters long`
  }
  return null
}

// E.164: '+' followed by up to 15 digits, first digit of the number must not
// be zero. Formatting characters (spaces, dashes, dots, parentheses) are
// stripped; a '00' international prefix is converted to '+'.
const E164_REGEX = /^\+[1-9]\d{7,14}$/

/**
 * Normalize a phone number to E.164 format.
 * Returns the normalized string, or null if it cannot be valid E.164.
 */
export function normalizePhone (phone) {
  if (typeof phone !== 'string') { return null }
  let cleaned = phone.replace(/[\s\-().]/g, '')
  if (cleaned.startsWith('00')) { cleaned = `+${cleaned.slice(2)}` }
  return E164_REGEX.test(cleaned) ? cleaned : null
}

export function isValidPhone (phone) {
  return normalizePhone(phone) !== null
}
