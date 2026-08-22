class UnknownError extends Error {
  constructor (message) {
    super(message)
    this.name = 'UnknownError'
    this.message = message
  }

  toJSON () {
    return {
      error: {
        name: this.name,
        message: this.message
        // stack: this.stack
      }
    }
  }
}

class CreateUserError extends UnknownError {
  constructor (message) {
    super(message)
    this.name = 'CreateUserError'
    this.message = message
  }
}

// Thrown when an Email address is already associated with an account
// but the user is trying an OAuth account that is not linked to it.
class AccountNotLinkedError extends UnknownError {
  constructor (message) {
    super(message)
    this.name = 'AccountNotLinkedError'
    this.message = message
  }
}

/**
 * Base class for API-style auth errors (Better Auth parity).
 *
 * Carries a stable machine-readable `code` (e.g. 'USER_EXISTS') and the HTTP
 * status the API route should respond with. Returned as JSON by
 * src/server/internal/respond-json.js rather than as redirects.
 */
class AuthError extends UnknownError {
  constructor (code, status, message) {
    super(message || code)
    this.name = code
    this.code = code
    this.status = status
  }

  toJSON () {
    return {
      error: {
        name: this.name,
        code: this.code,
        message: this.message,
        status: this.status
      }
    }
  }
}

class WeakPasswordError extends AuthError {
  constructor (message = 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS') {
    super('WEAK_PASSWORD', 400, message)
  }
}

// Thrown on sign up when the email address is already registered
class UserExistsError extends AuthError {
  constructor (message = 'This email is already associated with an account') {
    super('USER_EXISTS', 409, message)
  }
}

// Thrown when current password does not match or credentials are invalid
class InvalidPasswordError extends AuthError {
  constructor (message = 'Invalid email or password') {
    super('INVALID_PASSWORD', 401, message)
  }
}

// Thrown when a token (password reset, OTP…) is invalid, expired or used
class InvalidTokenError extends AuthError {
  constructor (message = 'Invalid or expired token') {
    super('INVALID_TOKEN', 400, message)
  }
}

// Thrown when a client exceeds the allowed request rate (e.g. SMS OTP sends)
class RateLimitedError extends AuthError {
  constructor (message = 'Too many requests. Please try again later') {
    super('RATE_LIMITED', 429, message)
  }
}

module.exports = {
  UnknownError,
  CreateUserError,
  AccountNotLinkedError,
  AuthError,
  WeakPasswordError,
  UserExistsError,
  InvalidPasswordError,
  InvalidTokenError,
  RateLimitedError
}
