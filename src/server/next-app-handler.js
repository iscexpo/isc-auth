/**
 * App Router (Next.js 13+) Route Handler adapter for isc-auth.
 *
 * The core server (`ISCAuthHandler` in ./index.js) is written against the
 * Node.js `http.IncomingMessage` / `ServerResponse` API used by the Pages
 * Router API routes. Under the App Router there is no `req`/`res`; route
 * handlers receive a Web `Request` and must return a Web `Response`.
 *
 * This module bridges the two: it builds a minimal `req`/`res` shim, runs the
 * existing handler unchanged, and converts the captured response into a Web
 * `Response`. The OAuth/session/cookie logic therefore stays in one place.
 */
import ISCAuth from './index'

/** Parse a Cookie header into a plain object. */
function parseCookies (header = '') {
  const cookies = {}
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=')
    if (index < 0) continue
    const key = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

/** Build a Node-style req/res pair around a Web Request and a collector. */
function createNodeShim (request, params) {
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams.entries())
  // `[...iscauth]` catch-all segments are exposed as `req.query.iscauth`
  query.iscauth = params.iscauth ?? []

  const state = {
    statusCode: 200,
    headers: {},
    body: undefined,
    isJson: false
  }

  const res = {
    status (code) {
      state.statusCode = code
      return res
    },
    setHeader (name, value) {
      state.headers[name.toLowerCase()] = value
      return res
    },
    getHeader (name) {
      return state.headers[name.toLowerCase()]
    },
    json (payload) {
      state.isJson = true
      state.body = JSON.stringify(payload)
      return res
    },
    send (data) {
      state.body = typeof data === 'string' ? data : JSON.stringify(data)
      return res
    },
    end (data) {
      if (data !== undefined) state.body = data
      return res
    }
  }

  const req = {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    query,
    cookies: parseCookies(request.headers.get('cookie') ?? ''),
    body: undefined,
    options: undefined
  }

  return { req, res, state }
}

/** Parse a Web Request body into a plain object (form-urlencoded or json). */
async function parseBody (request) {
  const type = request.headers.get('content-type') || ''
  if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'PATCH') {
    return {}
  }
  try {
    if (type.includes('application/json')) {
      return await request.json()
    }
    const form = await request.formData()
    const body = {}
    for (const [key, value] of form.entries()) {
      body[key] = typeof value === 'string' ? value : value.name
    }
    return body
  } catch (error) {
    const text = await request.text()
    const body = {}
    for (const [key, value] of new URLSearchParams(text)) body[key] = value
    return body
  }
}

/**
 * App Router entry point.
 *
 * Usage in `app/api/auth/[...iscauth]/route.js`:
 *   import ISCAuthApp from 'isc-auth/app'
 *   const handler = ISCAuthApp({ providers: [...], ... })
 *   export const GET = handler
 *   export const POST = handler
 *
 * @param {object} userOptions isc-auth options (same as the Pages Router export)
 * @returns {(request: Request, context: { params: { iscauth?: string[] } }) => Promise<Response>}
 */
export default function ISCAuthApp (userOptions) {
  const nodeHandler = ISCAuth(userOptions)

  return async function appRouteHandler (request, context = {}) {
    const params = context.params ?? {}
    const { req, res, state } = createNodeShim(request, params)
    req.body = await parseBody(request)

    await nodeHandler(req, res)

    const headers = new Headers()
    for (const [name, value] of Object.entries(state.headers)) {
      if (name === 'set-cookie') {
        // cookie.set accumulates an array of serialized cookies
        for (const cookie of (Array.isArray(value) ? value : [value])) {
          headers.append('Set-Cookie', cookie)
        }
      } else {
        headers.set(name, value)
      }
    }

    if (state.isJson && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    } else if (state.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'text/plain;charset=utf-8')
    }

    if (state.statusCode === 302 && headers.has('location')) {
      return new Response(null, { status: 302, headers })
    }

    return new Response(state.body ?? null, {
      status: state.statusCode,
      headers
    })
  }
}
