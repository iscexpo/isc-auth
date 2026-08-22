import logger from '../../lib/logger'

/**
 * Helpers for returning JSON responses from API-style routes
 * (Better Auth parity: JSON bodies with stable error codes instead of
 * redirects). Legacy browser flows keep using redirects.
 */

/** Return a successful JSON response */
export function jsonOk (res, data = {}, status = 200) {
  return res.status(status).json(data)
}

/**
 * Return a JSON error response.
 *
 * Accepts an Error instance; if it carries `code` and `status` properties
 * (see AuthError in src/lib/errors.js) they drive the response, otherwise
 * falls back to a generic 500 UNKNOWN_ERROR so internals never leak.
 */
export function jsonError (res, error, status) {
  const known = error && typeof error.code === 'string'
  const statusCode = status ?? (known ? error.status : 500)
  const code = known ? error.code : 'UNKNOWN_ERROR'

  logger.error(code, error)

  return res.status(statusCode).json({
    error: {
      code,
      message: known ? error.message : 'Internal server error'
    }
  })
}
