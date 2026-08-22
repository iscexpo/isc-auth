/**
 * Function to set cookies server side
 *
 * Credit to @huv1k and @jshttp contributors for the code which this is based on (MIT License).
 * * https://github.com/jshttp/cookie/blob/master/index.js
 * * https://github.com/zeit/next.js/blob/master/examples/api-routes-middleware/utils/cookies.js
 *
 * As only partial functionlity is required, only the code we need has been incorporated here
 * (with fixes for specific issues) to keep dependancy size down.
 */
export function set (res, name, value, options = {}) {
  const stringValue = typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value)

  if ('maxAge' in options) {
    options.expires = new Date(Date.now() + options.maxAge)
    options.maxAge /= 1000
  }

  // Preserve any existing cookies that have already been set in the same session
  let setCookieHeader = res.getHeader('Set-Cookie') || []
  // If not an array (i.e. a string with a single cookie) convert it into an array
  if (!Array.isArray(setCookieHeader)) { setCookieHeader = [setCookieHeader] }
  setCookieHeader.push(_serialize(name, String(stringValue), options))
  res.setHeader('Set-Cookie', setCookieHeader)
}

function _serialize (name, val, options) {
  const fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/ // eslint-disable-line no-control-regex

  const opt = options || {}
  const enc = opt.encode || encodeURIComponent

  if (typeof enc !== 'function') { throw new TypeError('option encode is invalid') }

  if (!fieldContentRegExp.test(name)) { throw new TypeError('argument name is invalid') }

  const value = enc(val)

  if (value && !fieldContentRegExp.test(value)) { throw new TypeError('argument val is invalid') }

  let str = name + '=' + value

  if (opt.maxAge != null) {
    const maxAge = opt.maxAge - 0

    if (isNaN(maxAge) || !isFinite(maxAge)) { throw new TypeError('option maxAge is invalid') }

    str += '; Max-Age=' + Math.floor(maxAge)
  }

  if (opt.domain) {
    if (!fieldContentRegExp.test(opt.domain)) { throw new TypeError('option domain is invalid') }

    str += '; Domain=' + opt.domain
  }

  if (opt.path) {
    if (!fieldContentRegExp.test(opt.path)) { throw new TypeError('option path is invalid') }

    str += '; Path=' + opt.path
  } else {
    str += '; Path=/'
  }

  if (opt.expires) {
    let expires = opt.expires
    if (typeof opt.expires.toUTCString === 'function') {
      expires = opt.expires.toUTCString()
    } else {
      const dateExpires = new Date(opt.expires)
      expires = dateExpires.toUTCString()
    }
    str += '; Expires=' + expires
  }

  if (opt.httpOnly) { str += '; HttpOnly' }

  if (opt.secure) { str += '; Secure' }

  if (opt.sameSite) {
    const sameSite = typeof opt.sameSite === 'string' ? opt.sameSite.toLowerCase() : opt.sameSite

    switch (sameSite) {
      case true:
        str += '; SameSite=Strict'
        break
      case 'lax':
        str += '; SameSite=Lax'
        break
      case 'strict':
        str += '; SameSite=Strict'
        break
      case 'none':
        str += '; SameSite=None'
        break
      default:
        throw new TypeError('option sameSite is invalid')
    }
  }

  return str
}

/**
 * Use secure cookies if the site uses HTTPS
 * This being conditional allows cookies to work non-HTTPS development URLs
 * Honour secure cookie option, which sets 'secure' and also adds '__Secure-'
 * prefix, but enable them by default if the site URL is HTTPS; but not for
 * non-HTTPS URLs like http://localhost which are used in development).
 * For more on prefixes see https://googlechrome.github.io/samples/cookie-prefixes/
 *
 * @TODO Review cookie settings (names, options)
 */
/**
 * Canonical cookie names for a given security context, exposed so middleware
 * (e.g. Next.js proxy.ts / middleware.ts) can reference session cookies
 * without hardcoding names.
 *
 * Returns e.g. for useSecureCookies=true:
 *   { sessionToken: '__Secure-isc-auth.session-token',
 *     callbackUrl: '__Secure-isc-auth.callback-url',
 *     csrfToken: '__Host-isc-auth.csrf-token' }
 */
export function getSessionCookieNames (useSecureCookies = true) {
  const cookiePrefix = useSecureCookies ? '__Secure-' : ''
  return {
    sessionToken: `${cookiePrefix}isc-auth.session-token`,
    callbackUrl: `${cookiePrefix}isc-auth.callback-url`,
    csrfToken: `${useSecureCookies ? '__Host-' : ''}isc-auth.csrf-token`
  }
}

/**
 * Drop-in aliases matching Better Auth's default cookie names, for deployments
 * where existing edge middleware expects those names. Pass these via:
 *
 *   cookies: {
 *     sessionToken: { name: BETTER_AUTH_COOKIE_ALIASES.sessionToken },
 *   }
 */
export const BETTER_AUTH_COOKIE_ALIASES = {
  sessionToken: '__Secure-better-auth.session_token',
  callbackUrl: '__Secure-better-auth.callback_url',
  csrfToken: '__Host-better-auth.csrf_token'
}

export function defaultCookies (useSecureCookies) {
  const cookiePrefix = useSecureCookies ? '__Secure-' : ''
  return {
    // default cookie options
    sessionToken: {
      name: `${cookiePrefix}isc-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies
      }
    },
    callbackUrl: {
      name: `${cookiePrefix}isc-auth.callback-url`,
      options: {
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies
      }
    },
    csrfToken: {
      // Default to __Host- for CSRF token for additional protection if using useSecureCookies
      // NB: The `__Host-` prefix is stricter than the `__Secure-` prefix.
      name: `${useSecureCookies ? '__Host-' : ''}isc-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies
      }
    }
  }
}
