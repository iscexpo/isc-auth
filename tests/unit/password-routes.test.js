const assert = require('assert')
const changePassword = require('../../dist/server/routes/change-password').default
const forgotPassword = require('../../dist/server/routes/forgot-password').default
const resetPassword = require('../../dist/server/routes/reset-password').default
const defaultCookies = require('../../dist/server/internal/cookie').defaultCookies
const jwt = require('../../dist/lib/jwt').default
const { hashPassword, verifyPassword } = require('../../dist/lib/password')

const SECRET = 'unit-test-secret'

function fakeAdapter () {
  const state = { users: [], verificationRequests: [] }
  return {
    state,
    getAdapter: async () => ({
      async getUserByEmail (email) {
        return state.users.find(u => u.email === email) || null
      },
      async updateUser (user) {
        const index = state.users.findIndex(u => `${u.id}` === `${user.id}`)
        state.users[index] = user
        return user
      },
      async createVerificationRequest (identifier, url, token, secret, provider) {
        const hashedToken = require('crypto').createHash('sha256').update(`${token}${secret}`).digest('hex')
        let expires = null
        if (provider.maxAge) {
          expires = new Date(Date.now() + provider.maxAge * 1000)
        }
        state.verificationRequests = state.verificationRequests.filter(r => r.identifier !== identifier)
        const record = { identifier, token: hashedToken, expires }
        state.verificationRequests.push(record)
        await provider.sendVerificationRequest({ identifier, url, token, provider })
        return record
      },
      async getVerificationRequest (identifier, token, secret) {
        const hashedToken = require('crypto').createHash('sha256').update(`${token}${secret}`).digest('hex')
        const found = state.verificationRequests.find(r => r.identifier === identifier && r.token === hashedToken)
        if (!found) { return null }
        if (found.expires && new Date() > new Date(found.expires)) { return null }
        return found
      },
      async deleteVerificationRequest (identifier, token, secret) {
        const hashedToken = require('crypto').createHash('sha256').update(`${token}${secret}`).digest('hex')
        state.verificationRequests = state.verificationRequests.filter(r => r.token !== hashedToken)
      },
      async getUser (id) {
        return state.users.find(u => `${u.id}` === `${id}`) || null
      },
      async getSession () { return null }
    })
  }
}

async function makeOptions ({ useJwtSession = true } = {}) {
  const adapter = fakeAdapter()
  const sentResetRequests = []
  const options = {
    adapter,
    providers: [],
    secret: SECRET,
    cookies: defaultCookies(false),
    baseUrl: 'http://localhost:3000',
    basePath: '/api/auth',
    events: {},
    callbacks: {},
    jwt: {
      secret: SECRET,
      maxAge: 2592000,
      encode: jwt.encode,
      decode: jwt.decode
    },
    session: { jwt: useJwtSession, maxAge: 2592000 },
    forgotPassword: {
      sendResetRequest: ({ identifier: email, token }) => {
        sentResetRequests.push({ email, token })
        return Promise.resolve()
      },
      tokenMaxAgeSeconds: 3600,
      store: (() => {
        // fresh in-memory store per test run
        const hits = new Map()
        return {
          incr (key, windowMs, now = Date.now()) {
            const entry = hits.get(key)
            if (!entry || now >= entry.resetAt) {
              hits.set(key, { count: 1, resetAt: now + windowMs })
              return 1
            }
            entry.count += 1
            return entry.count
          },
          reset (key) { hits.delete(key) },
          stop () {}
        }
      })()
    }
  }
  return { adapter, options, sentResetRequests }
}

function mockReq ({ body = {}, cookies = {} } = {}) {
  return {
    method: 'POST',
    body,
    headers: {},
    cookies,
    connection: { remoteAddress: '127.0.0.1' },
    options: null
  }
}

function mockRes () {
  return {
    statusCode: 200,
    jsonBody: null,
    status (code) { this.statusCode = code; return this },
    json (data) { this.jsonBody = data; return this },
    getHeader () { return [] },
    setHeader () {}
  }
}

describe('server/routes/password', () => {
  describe('changePassword', () => {
    it('changes the password for a signed-in JWT user', async () => {
      const { adapter, options } = await makeOptions()
      const oldHash = await hashPassword('old-password-123')
      adapter.state.users.push({ id: '1', name: 'Ada', email: 'ada@example.com', passwordHash: oldHash })

      const sessionJwt = await jwt.encode({ token: { sub: '1' }, secret: SECRET })
      const req = mockReq({
        body: { currentPassword: 'old-password-123', newPassword: 'new-password-456' },
        cookies: { 'isc-auth.session-token': sessionJwt }
      })
      req.options = options
      const res = mockRes()

      await changePassword(req, res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.ok, true)

      const updatedUser = adapter.state.users[0]
      assert.notStrictEqual(updatedUser.passwordHash, oldHash)
      assert.strictEqual(await verifyPassword('new-password-456', updatedUser.passwordHash), true)
      assert.strictEqual(await verifyPassword('old-password-123', updatedUser.passwordHash), false)
    })

    it('returns UNAUTHENTICATED without a valid session', async () => {
      const { options } = await makeOptions()
      const req = mockReq({ body: { currentPassword: 'x', newPassword: 'yyyyyyyy' } })
      req.options = options
      const res = mockRes()

      await changePassword(req, res)

      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.jsonBody.error.code, 'UNAUTHENTICATED')
    })

    it('rejects a wrong current password', async () => {
      const { adapter, options } = await makeOptions()
      adapter.state.users.push({ id: '1', email: 'ada@example.com', passwordHash: await hashPassword('correct-horse') })

      const sessionJwt = await jwt.encode({ token: { sub: '1' }, secret: SECRET })
      const req = mockReq({
        body: { currentPassword: 'wrong-password', newPassword: 'new-password-456' },
        cookies: { 'isc-auth.session-token': sessionJwt }
      })
      req.options = options
      const res = mockRes()

      await changePassword(req, res)

      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(res.jsonBody.error.code, 'INVALID_PASSWORD')
    })

    it('rejects a weak new password without touching the hash', async () => {
      const { adapter, options } = await makeOptions()
      const originalHash = await hashPassword('correct-horse')
      adapter.state.users.push({ id: '1', email: 'ada@example.com', passwordHash: originalHash })

      const sessionJwt = await jwt.encode({ token: { sub: '1' }, secret: SECRET })
      const req = mockReq({
        body: { currentPassword: 'correct-horse', newPassword: 'short' },
        cookies: { 'isc-auth.session-token': sessionJwt }
      })
      req.options = options
      const res = mockRes()

      await changePassword(req, res)

      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.error.code, 'WEAK_PASSWORD')
      assert.strictEqual(adapter.state.users[0].passwordHash, originalHash)
    })
  })

  describe('forgotPassword / resetPassword', () => {
    async function setupWithUser () {
      const { adapter, options, sentResetRequests } = await makeOptions()
      adapter.state.users.push({
        id: '7',
        name: 'Ada',
        email: 'ada@example.com',
        passwordHash: await hashPassword('old-password-123')
      })
      return { adapter, options, sentResetRequests }
    }

    it('sends a reset token and completes the reset flow', async () => {
      const { adapter, options, sentResetRequests } = await setupWithUser()

      // Step 1: request a reset
      const forgotReq = mockReq({ body: { email: 'ada@example.com' } })
      forgotReq.options = options
      const forgotRes = mockRes()
      await forgotPassword(forgotReq, forgotRes)

      assert.strictEqual(forgotRes.statusCode, 200)
      assert.strictEqual(forgotRes.jsonBody.ok, true)
      assert.strictEqual(sentResetRequests.length, 1)

      // Step 2: consume the token with a new password
      const { token } = sentResetRequests[0]
      const resetReq = mockReq({ body: { email: 'ada@example.com', token, newPassword: 'brand-new-pw-9' } })
      resetReq.options = options
      const resetRes = mockRes()
      await resetPassword(resetReq, resetRes)

      assert.strictEqual(resetRes.statusCode, 200)
      assert.strictEqual(resetRes.jsonBody.ok, true)

      const user = adapter.state.users[0]
      assert.strictEqual(await verifyPassword('brand-new-pw-9', user.passwordHash), true)
      // token is single-use
      assert.strictEqual(adapter.state.verificationRequests.length, 0)
    })

    it('always responds ok for unknown accounts (no enumeration)', async () => {
      const { adapter, options, sentResetRequests } = await setupWithUser()

      const req = mockReq({ body: { email: 'nobody@example.com' } })
      req.options = options
      const res = mockRes()
      await forgotPassword(req, res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.ok, true)
      assert.strictEqual(sentResetRequests.length, 0)
      assert.strictEqual(adapter.state.verificationRequests.length, 0)
    })

    it('responds ok but sends nothing when no sender is configured', async () => {
      const { options } = await makeOptions()
      delete options.forgotPassword

      const req = mockReq({ body: { email: 'ada@example.com' } })
      req.options = options
      const res = mockRes()
      await forgotPassword(req, res)

      assert.strictEqual(res.statusCode, 500)
      assert.strictEqual(res.jsonBody.error.code, 'CONFIGURATION_ERROR')
    })

    it('rejects an invalid token', async () => {
      const { adapter, options } = await setupWithUser()

      const req = mockReq({ body: { email: 'ada@example.com', token: 'not-a-real-token', newPassword: 'brand-new-pw-9' } })
      req.options = options
      const res = mockRes()
      await resetPassword(req, res)

      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.error.code, 'INVALID_TOKEN')
      // password untouched
      assert.strictEqual(await verifyPassword('old-password-123', adapter.state.users[0].passwordHash), true)
    })

    it('validates the new password before consuming the token', async () => {
      const { adapter, options, sentResetRequests } = await setupWithUser()

      const forgotReq = mockReq({ body: { email: 'ada@example.com' } })
      forgotReq.options = options
      await forgotPassword(forgotReq, mockRes())

      const req = mockReq({ body: { email: 'ada@example.com', token: sentResetRequests[0].token, newPassword: 'short' } })
      req.options = options
      const res = mockRes()
      await resetPassword(req, res)

      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.error.code, 'WEAK_PASSWORD')
      // weak password must NOT burn the single-use token
      assert.strictEqual(adapter.state.verificationRequests.length, 1)
    })
  })
})
