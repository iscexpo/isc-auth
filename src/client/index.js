/// Note: fetch() is built in to Next.js 9.4
//
// Note about signIn() and signOut() methods:
//
// On signIn() and signOut() we pass 'json: true' to request a response in JSON
// instead of HTTP as redirect URLs on other domains are not returned to
// requests made using the fetch API in the browser, and we need to ask the API
// to return the response as a JSON object (the end point still defaults to
// returning an HTTP response with a redirect for non-JavaScript clients).
//
// We use HTTP POST requests with CSRF Tokens to protect against CSRF attacks.

/* global fetch:false */
import { useState, useEffect, useContext, useCallback, createContext, createElement } from 'react'
import logger from '../lib/logger'
import parseUrl from '../lib/parse-url'

// This behaviour mirrors the default behaviour for getting the site name that
// happens server side in server/index.js
// 1. An empty value is legitimate when the code is being invoked client side as
//    relative URLs are valid in that context and so defaults to empty.
// 2. When invoked server side the value is picked up from an environment
//    variable and defaults to 'http://localhost:3000'.
const __ISCAUTH = {
  baseUrl: parseUrl(process.env.ISCAUTH_URL || process.env.VERCEL_URL).baseUrl,
  basePath: parseUrl(process.env.ISCAUTH_URL).basePath,
  keepAlive: 0, // 0 == disabled (don't send); 60 == send every 60 seconds
  clientMaxAge: 0, // 0 == disabled (only use cache); 60 == sync if last checked > 60 seconds ago
  // Properties starting with _ are used for tracking internal app state
  _clientLastSync: 0, // used for timestamp since last sycned (in seconds)
  _clientSyncTimer: null, // stores timer for poll interval
  _eventListenersAdded: false, // tracks if event listeners have been added,
  _clientSession: undefined, // stores last session response from hook,
  // Generate a unique ID to make it possible to identify when a message
  // was sent from this tab/window so it can be ignored to avoid event loops.
  _clientId: Math.random().toString(36).substring(2) + Date.now().toString(36),
  // Used to store to function export by getSession() hook
  _getSession: () => { }
}

// Add event listners on load
if (typeof window !== 'undefined') {
  if (__ISCAUTH._eventListenersAdded === false) {
    __ISCAUTH._eventListenersAdded = true

    // Listen for storage events and update session if event fired from
    // another window (but suppress firing another event to avoid a loop)
    window.addEventListener('storage', async (event) => {
      if (event.key === 'iscauth.message') {
        const message = JSON.parse(event.newValue)
        if (message.event && message.event === 'session' && message.data) {
          // Ignore storage events fired from the same window that created them
          if (__ISCAUTH._clientId === message.clientId) {
            return
          }

          // Fetch new session data but pass 'true' to it not to fire an event to
          // avoid an infinite loop.
          //
          // Note: We could pass session data through and do something like
          // `setData(message.data)` but that can cause problems depending
          // on how the session object is being used in the client; it is
          // more robust to have each window/tab fetch it's own copy of the
          // session object rather than share it across instances.
          await __ISCAUTH._getSession({ event: 'storage' })
        }
      }
    })

    // Listen for window focus/blur events
    window.addEventListener('focus', async (event) => __ISCAUTH._getSession({ event: 'focus' }))
    window.addEventListener('blur', async (event) => __ISCAUTH._getSession({ event: 'blur' }))
  }
}

// Method to set options. The documented way is to use the provider, but this
// method is being left in as an alternative, that will be helpful if/when we
// expose a vanilla JavaScript version that doesn't depend on React.
const setOptions = ({
  baseUrl,
  basePath,
  clientMaxAge,
  keepAlive
} = {}) => {
  if (baseUrl) { __ISCAUTH.baseUrl = baseUrl }
  if (basePath) { __ISCAUTH.basePath = basePath }
  if (clientMaxAge) { __ISCAUTH.clientMaxAge = clientMaxAge }
  if (keepAlive) {
    __ISCAUTH.keepAlive = keepAlive

    if (typeof window !== 'undefined' && keepAlive > 0) {
      // Clear existing timer (if there is one)
      if (__ISCAUTH._clientSyncTimer !== null) { clearTimeout(__ISCAUTH._clientSyncTimer) }

      // Set next timer to trigger in number of seconds
      __ISCAUTH._clientSyncTimer = setTimeout(async () => {
        // Only invoke keepalive when a session exists
        if (__ISCAUTH._clientSession) {
          await __ISCAUTH._getSession({ event: 'timer' })
        }
      }, keepAlive * 1000)
    }
  }
}

// Universal method (client + server)
const getSession = async ({ req, ctx, triggerEvent = true } = {}) => {
  // If passed 'appContext' via getInitialProps() in _app.js then get the req
  // object from ctx and use that for the req value to allow getSession() to
  // work seemlessly in getInitialProps() on server side pages *and* in _app.js.
  if (!req && ctx && ctx.req) { req = ctx.req }

  const baseUrl = _apiBaseUrl()
  const fetchOptions = req ? { headers: { cookie: req.headers.cookie } } : {}
  const session = await _fetchData(`${baseUrl}/session`, fetchOptions)
  if (triggerEvent) {
    _sendMessage({ event: 'session', data: { trigger: 'getSession' } })
  }
  return session
}

// Universal method (client + server)
const getCsrfToken = async ({ req, ctx } = {}) => {
  // If passed 'appContext' via getInitialProps() in _app.js then get the req
  // object from ctx and use that for the req value to allow getCsrfToken() to
  // work seemlessly in getInitialProps() on server side pages *and* in _app.js.
  if (!req && ctx && ctx.req) { req = ctx.req }

  const baseUrl = _apiBaseUrl()
  const fetchOptions = req ? { headers: { cookie: req.headers.cookie } } : {}
  const data = await _fetchData(`${baseUrl}/csrf`, fetchOptions)
  return data && data.csrfToken ? data.csrfToken : null
}

// Universal method (client + server); does not require request headers
const getProviders = async () => {
  const baseUrl = _apiBaseUrl()
  return _fetchData(`${baseUrl}/providers`)
}

// Context to store session data globally
const SessionContext = createContext()

// Client side method
//
// Legacy v3 hook. Returns a [session, loading] tuple.
// Deprecated in favour of useAuthSession(); will be removed in 2.0.
export const useSession = (session) => {
  // Try to use context if we can
  const value = useContext(SessionContext)

  // If we have no Provider in the tree, call the actual hook
  if (value === undefined) {
    const state = _useSessionState(session)
    return [state.data, state.loading]
  }

  // The Provider stores the object shaped state; convert to a tuple
  return Array.isArray(value) ? value : [value.data, value.loading]
}

// Client side method
//
// Better Auth style session hook. Returns an object:
//   { data, isPending, error, refetch }
//   - data:      session payload or null
//   - isPending: true while the first session fetch is in flight
//   - error:     error from the last fetch, or null
//   - refetch(): force re-fetch of the session (bypasses clientMaxAge cache)
const useAuthSession = () => {
  const value = useContext(SessionContext)

  if (value === undefined) {
    const state = _useSessionState()
    return { data: state.data, isPending: state.loading, error: state.error, refetch: state.refetch }
  }

  if (Array.isArray(value)) {
    // Context still holds the legacy tuple shape
    return {
      data: value[0],
      isPending: value[1],
      error: null,
      refetch: () => (__ISCAUTH._getSession ? __ISCAUTH._getSession({ event: 'forced' }) : Promise.resolve())
    }
  }

  return { data: value.data, isPending: value.loading, error: value.error, refetch: value.refetch }
}

// Internal hook that fetches and keeps session state.
// Returns object shaped state shared by both public hooks and the Provider.
const _useSessionState = (session) => {
  const [data, setData] = useState(session)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const _getSession = async ({ event = null } = {}) => {
      try {
        const triggredByEvent = (event !== null)
        const triggeredByStorageEvent = !!((event && event === 'storage'))

        const clientMaxAge = __ISCAUTH.clientMaxAge
        const clientLastSync = parseInt(__ISCAUTH._clientLastSync)
        const currentTime = Math.floor(new Date().getTime() / 1000)
        const clientSession = __ISCAUTH._clientSession

        // Updates triggered by a storage event *always* trigger an update and we
        // always update if we don't have any value for the current session state.
        if (triggeredByStorageEvent === false && clientSession !== undefined) {
          if (clientMaxAge === 0 && triggredByEvent !== true) {
            // If there is no time defined for when a session should be considered
            // stale, then it's okay to use the value we have until an event is
            // triggered which updates it.
            return
          } else if (clientMaxAge > 0 && clientSession === null) {
            // If the client doesn't have a session then we don't need to call
            // the server to check if it does (if they have signed in via another
            // tab or window that will come through as a triggeredByStorageEvent
            // event and will skip this logic)
            return
          } else if (clientMaxAge > 0 && currentTime < (clientLastSync + clientMaxAge)) {
            // If the session freshness is within clientMaxAge then don't request
            // it again on this call (avoids too many invokations).
            return
          }
        }

        if (clientSession === undefined) { __ISCAUTH._clientSession = null }

        // Update clientLastSync before making response to avoid repeated
        // invokations that would otherwise be triggered while we are still
        // waiting for a response.
        __ISCAUTH._clientLastSync = Math.floor(new Date().getTime() / 1000)

        // If this call was invoked via a storage event (i.e. another window) then
        // tell getSession not to trigger an event when it calls to avoid an
        // infinate loop.
        const triggerEvent = (triggeredByStorageEvent === false)
        const newClientSessionData = await getSession({ triggerEvent })

        // Save session state internally, just so we can track that we've checked
        // if a session exists at least once.
        __ISCAUTH._clientSession = newClientSessionData

        setData(newClientSessionData)
        setLoading(false)
      } catch (error) {
        logger.error('CLIENT_USE_SESSION_ERROR', error)
        setError(error)
        setLoading(false)
      }
    }

    __ISCAUTH._getSession = _getSession

    _getSession()
  })

  // Force a network refresh, bypassing the clientMaxAge caching heuristics
  const refetch = useCallback(async () => {
    setError(null)
    try {
      const newData = await getSession()
      __ISCAUTH._clientLastSync = Math.floor(new Date().getTime() / 1000)
      __ISCAUTH._clientSession = newData
      setData(newData)
      setLoading(false)
      return newData
    } catch (error) {
      logger.error('CLIENT_USE_SESSION_ERROR', error)
      setError(error)
      setLoading(false)
      return null
    }
  }, [])

  return { data, loading, error, refetch }
}

// Client side method
export const signIn = async (provider, args = {}) => {
  const baseUrl = _apiBaseUrl()
  const callbackUrl = args.callbackUrl ?? window.location
  const providers = await getProviders()

  // Redirect to sign in page if no valid provider specified
  if (!(provider in providers)) {
    // If Provider not recognized, redirect to sign in page
    window.location = `${baseUrl}/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
  } else {
    const signInUrl = (providers[provider].type === 'credentials')
      ? `${baseUrl}/callback/${provider}`
      : `${baseUrl}/signin/${provider}`

    // If is any other provider type, POST to provider URL with CSRF Token,
    // callback URL and any other parameters supplied.
    const fetchOptions = {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: _encodedForm({
        ...args,
        csrfToken: await getCsrfToken(),
        callbackUrl: callbackUrl,
        json: true
      })
    }
    const res = await fetch(signInUrl, fetchOptions)
    const data = await res.json()
    window.location = data.url ?? callbackUrl
  }
}

// Client side method
export const signOut = async (args = {}) => {
  const callbackUrl = args.callbackUrl ?? window.location

  const baseUrl = _apiBaseUrl()
  const fetchOptions = {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: _encodedForm({
      csrfToken: await getCsrfToken(),
      callbackUrl: callbackUrl,
      json: true
    })
  }
  const res = await fetch(`${baseUrl}/signout`, fetchOptions)
  const data = await res.json()
  _sendMessage({ event: 'session', data: { trigger: 'signout' } })
  window.location = data.url ?? callbackUrl
}

// Shared helper for JSON API endpoints (Better Auth parity methods).
// Always resolves: success -> { ...body, ok: true, error: null },
// failure -> { ok: false, error: { code, message } }.
const _postJson = async (path, data, errorCode) => {
  const baseUrl = _apiBaseUrl()
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...data,
        csrfToken: await getCsrfToken()
      })
    })
    const body = await res.json()

    if (!res.ok) {
      const error = (body && body.error) ? body.error : { code: errorCode, message: 'Request failed' }
      logger.error(errorCode, error)
      return { ok: false, error }
    }

    // Let other tabs/windows know session state may have changed
    if (path === '/otp/verify' || path === '/signup/email') {
      _sendMessage({ event: 'session', data: { trigger: 'signUp' } })
    }

    return { ...body, ok: true, error: null }
  } catch (error) {
    logger.error(errorCode, error)
    return { ok: false, error: { code: 'CLIENT_FETCH_ERROR', message: 'Unable to reach the authentication endpoint' } }
  }
}

// Client side method
//
// Change the password of the currently signed-in user.
// Resolves to { ok: true } or { ok: false, error }.
const changePassword = async ({ currentPassword, newPassword } = {}) => {
  return _postJson('/password/change', { currentPassword, newPassword }, 'CLIENT_CHANGE_PASSWORD_ERROR')
}

// Client side method
//
// Request a password reset email. Always resolves to { ok: true } (or a
// CLIENT_FETCH_ERROR for network failures) so account existence is not leaked.
const forgotPassword = async ({ email } = {}) => {
  return _postJson('/password/forgot', { email }, 'CLIENT_FORGOT_PASSWORD_ERROR')
}

// Client side method
//
// Consume a password reset token and set a new password.
// Resolves to { ok: true } or { error: { code: 'INVALID_TOKEN' } }.
const resetPassword = async ({ email, token, newPassword, password } = {}) => {
  return _postJson('/password/reset', { email, token, newPassword: newPassword ?? password }, 'CLIENT_RESET_PASSWORD_ERROR')
}

// Client side method
//
// Register a new user account with email + password (Better Auth parity).
// Unlike signIn()/signOut() this does not redirect; it resolves to an object
// with either `user` or `error` set:
//   { user: { id, name, email, image }, error: null }
//   { user: null, error: { code: 'USER_EXISTS', message: '…' } }
const signUpEmail = async ({ name, email, password, image, callbackUrl } = {}) => {
  const result = await _postJson('/signup/email', { name, email, password, image, callbackUrl }, 'CLIENT_SIGNUP_ERROR')
  return { user: (result && result.user) || null, error: (result && result.error) || null }
}

// Client side method
//
// Request a one-time code over SMS for phone number sign up / sign in.
// Resolves to { ok: true, expiresIn } or { ok: false, error }.
const sendPhoneOtp = async ({ phone } = {}) => {
  return _postJson('/otp/send', { phone }, 'CLIENT_OTP_SEND_ERROR')
}

// Client side method
//
// Verify the one-time code for a phone number. On success the user is signed
// in (and registered if it was their first time) and a session cookie is set.
// Resolves to { user } or { error }.
const verifyPhoneOtp = async ({ phone, code } = {}) => {
  const result = await _postJson('/otp/verify', { phone, code }, 'CLIENT_OTP_VERIFY_ERROR')
  return { user: (result && result.user) || null, error: (result && result.error) || null }
}

// Provider to wrap the app in to make session data available globally
export const Provider = ({ children, session, options }) => {
  setOptions(options)
  return createElement(SessionContext.Provider, { value: _useSessionState(session) }, children)
}

const _fetchData = async (url, options = {}) => {
  try {
    const res = await fetch(url, options)
    const data = await res.json()
    return Promise.resolve(data && Object.keys(data).length > 0 ? data : null) // Return null if data empty
  } catch (error) {
    logger.error('CLIENT_FETCH_ERROR', url, error)
    return Promise.resolve(null)
  }
}

const _apiBaseUrl = () => {
  if (typeof window === 'undefined') {
    // ISCAUTH_URL should always be set explicitly to support server side calls - log warning if not set
    if (!process.env.ISCAUTH_URL) { logger.warn('ISCAUTH_URL', 'ISCAUTH_URL environment variable not set') }

    // Return absolute path when called server side
    return `${__ISCAUTH.baseUrl}${__ISCAUTH.basePath}`
  } else {
    // Return relative path when called client side
    return __ISCAUTH.basePath
  }
}

const _encodedForm = (formData) => {
  return Object.keys(formData).map((key) => {
    return encodeURIComponent(key) + '=' + encodeURIComponent(formData[key])
  }).join('&')
}

const _sendMessage = (message) => {
  if (typeof localStorage !== 'undefined') {
    const timestamp = Math.floor(new Date().getTime() / 1000)
    localStorage.setItem('iscauth.message', JSON.stringify({ ...message, clientId: __ISCAUTH._clientId, timestamp })) // eslint-disable-line
  }
}

export {
  getSession,
  getCsrfToken,
  getProviders,
  signUpEmail,
  sendPhoneOtp,
  verifyPhoneOtp,
  changePassword,
  forgotPassword,
  resetPassword,
  useAuthSession,
  setOptions
}

export default {
  getSession,
  getCsrfToken,
  getProviders,
  signUpEmail,
  sendPhoneOtp,
  verifyPhoneOtp,
  changePassword,
  forgotPassword,
  resetPassword,
  useSession,
  useAuthSession,
  signIn,
  signOut,
  Provider,
  /* Deprecated / unsupported features below this line */
  // Use setOptions() set options globally in the app.
  setOptions,
  // Some methods are exported with more than one name. This provides some
  // flexibility over how they can be invoked and backwards compatibility
  // with earlier releases.
  options: setOptions,
  session: getSession,
  providers: getProviders,
  csrfToken: getCsrfToken,
  signin: signIn,
  signout: signOut
}
