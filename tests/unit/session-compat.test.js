const assert = require('assert')
const { toBetterAuthSession, applyCompatSessionShape } = require('../../dist/server/internal/session-shape')
const sessionRoute = require('../../dist/server/routes/session').default
const defaultCookies = require('../../dist/server/internal/cookie').defaultCookies
const jwt = require('../../dist/lib/jwt').default

const SECRET = 'unit-test-secret'

function baseOptions ({ betterAuth = false } = {}) {
  return {
    adapter: null,
    providers: [],
    secret: SECRET,
    cookies: defaultCookies(false),
    baseUrl: 'http://localhost:3000',
    basePath: '/api/auth',
    events: {},
    callbacks: {
      jwt: (payload) => payload,
      session: (payload) => payload
    },
    jwt: {
      secret: SECRET,
      maxAge: 2592000,
      encode: jwt.encode,
      decode: jwt.decode
    },
    session: { jwt: true, maxAge: 2592000 },
    compat: { betterAuth }
  }
}

function mockReq ({ cookies = {}, options }) {
  return { method: 'GET', headers: {}, cookies, options, query: {} }
}

function mockRes () {
  return {
    statusCode: 200,
    jsonBody: undefined,
    status (code) { this.statusCode = code; return this },
    json (data) { this.jsonBody = data; return this },
    setHeader () {},
    getHeader () { return [] }
  }
}

async function sessionJwt ({ name = 'Ada', email = 'ada@example.com' } = {}) {
  return jwt.encode({ token: { sub: '1', name, email }, secret: SECRET })
}

describe('server/internal/session-shape', () => {
  it('converts a v3 shaped payload to the Better Auth shape', () => {
    const v3 = { user: { name: 'Ada', email: null, image: null }, expires: '2026-01-01T00:00:00.000Z' }
    assert.deepStrictEqual(toBetterAuthSession(v3), {
      user: { name: 'Ada', email: null, image: null },
      session: { expires: '2026-01-01T00:00:00.000Z' }
    })
  })

  it('keeps accessToken under the nested session object', () => {
    const v3 = { user: {}, accessToken: 'at_123', expires: '2026-01-01T00:00:00.000Z' }
    assert.deepStrictEqual(toBetterAuthSession(v3).session, { expires: v3.expires, accessToken: 'at_123' })
  })

  it('maps empty payloads to null', () => {
    assert.strictEqual(toBetterAuthSession({}), null)
    assert.strictEqual(toBetterAuthSession(null), null)
  })

  it('applyCompatSessionShape passes through when disabled', () => {
    const v3 = { user: { name: 'Ada' }, expires: 'x' }
    assert.strictEqual(applyCompatSessionShape(v3, {}), v3)
    assert.strictEqual(applyCompatSessionShape(v3, undefined), v3)
    assert.deepStrictEqual(applyCompatSessionShape(v3, { betterAuth: true }), {
      user: { name: 'Ada' },
      session: { expires: 'x' }
    })
  })
})

describe('server/routes/session (compat.betterAuth)', () => {
  it('returns the legacy flat shape by default', async () => {
    const token = await sessionJwt()
    const req = mockReq({ cookies: { 'isc-auth.session-token': token }, options: baseOptions() })
    const res = mockRes()

    await sessionRoute(req, res)

    assert.deepStrictEqual(Object.keys(res.jsonBody).sort(), ['expires', 'user'])
    assert.strictEqual(res.jsonBody.user.email, 'ada@example.com')
  })

  it('returns the nested Better Auth shape when enabled', async () => {
    const token = await sessionJwt()
    const req = mockReq({ cookies: { 'isc-auth.session-token': token }, options: baseOptions({ betterAuth: true }) })
    const res = mockRes()

    await sessionRoute(req, res)

    assert.deepStrictEqual(Object.keys(res.jsonBody).sort(), ['session', 'user'])
    assert.ok(res.jsonBody.session.expires)
    assert.strictEqual(res.jsonBody.user.email, 'ada@example.com')
  })

  it('responds with null instead of an empty object when signed out', async () => {
    const req = mockReq({ cookies: {}, options: baseOptions({ betterAuth: true }) })
    const res = mockRes()
    await sessionRoute(req, res)
    assert.strictEqual(res.jsonBody, null)

    const legacyRes = mockRes()
    await sessionRoute(mockReq({ cookies: {}, options: baseOptions() }), legacyRes)
    assert.deepStrictEqual(legacyRes.jsonBody, {})
  })
})

describe('server/api getSession', () => {
  const createApi = require('../../dist/server/api').default

  afterEach(() => {
    delete global.fetch
    delete global.__ISCAUTH
  })

  it('resolves the session from a Headers instance and maps nothing by default', async () => {
    global.__ISCAUTH = { baseUrl: 'http://localhost:3000', basePath: '/api/auth' }
    const api = createApi({})
    const fetched = []
    global.fetch = async (url) => {
      fetched.push(url)
      return { json: async () => ({ user: { name: 'Ada' }, expires: '2026-01-01T00:00:00.000Z' }) }
    }

    const headers = new Headers({ cookie: 'isc-auth.session-token=abc' })
    const result = await api.getSession({ headers })

    assert.strictEqual(fetched[0], 'http://localhost:3000/api/auth/session')
    assert.strictEqual(result.user.name, 'Ada')
    assert.ok(!result.session)
  })

  it('accepts plain header objects and returns null without a user', async () => {
    global.__ISCAUTH = { baseUrl: 'http://localhost:3000', basePath: '/api/auth' }
    const api = createApi({})
    global.fetch = async () => ({ json: async () => ({}) })

    const result = await api.getSession({ headers: { cookie: 'x=1' } })
    assert.strictEqual(result, null)
  })

  it('supports the req/ctx calling convention of the universal helper', async () => {
    global.__ISCAUTH = { baseUrl: 'http://localhost:3000', basePath: '/api/auth' }
    const api = createApi({})
    const seen = []
    global.fetch = async (url, opts) => {
      seen.push(opts.headers.cookie)
      return { json: async () => ({ user: { name: 'Ada' } }) }
    }

    await api.getSession({ req: { headers: { cookie: 'from-req=1' } } })
    await api.getSession({ ctx: { req: { headers: { cookie: 'from-ctx=1' } } } })

    assert.deepStrictEqual(seen, ['from-req=1', 'from-ctx=1'])
  })

  it('is attached to the configured handler as auth.api', () => {
    const ISCAuth = require('../../dist/core/index.js').default
    const auth = ISCAuth({ providers: [] })
    assert.strictEqual(typeof auth.api, 'object')
    assert.strictEqual(typeof auth.api.getSession, 'function')
    assert.strictEqual(typeof auth, 'function')
  })
})
