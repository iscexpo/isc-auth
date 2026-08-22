const assert = require('assert')
const otpSend = require('../../dist/server/routes/otp-send').default
const otpVerify = require('../../dist/server/routes/otp-verify').default
const defaultCookies = require('../../dist/server/internal/cookie').defaultCookies
const { createMemoryStore } = require('../../dist/server/internal/rate-limit')
const jwt = require('../../dist/lib/jwt').default
const Phone = require('../../dist/providers/phone').default

const SECRET = 'unit-test-secret'

/** In-memory adapter covering the methods the OTP routes use */
function fakeAdapter () {
  const state = { verificationRequests: [], users: [], sessions: [] }
  return {
    state,
    getAdapter: async () => ({
      async createVerificationRequest (identifier, url, token, secret, provider) {
        const hashedToken = require('crypto').createHash('sha256').update(`${token}${secret}`).digest('hex')
        let expires = null
        if (provider.maxAge) {
          expires = new Date(Date.now() + provider.maxAge * 1000)
        }
        // replace older requests for the same identifier (single active code)
        state.verificationRequests = state.verificationRequests.filter(r => r.identifier !== identifier)
        const record = { identifier, token: hashedToken, expires }
        state.verificationRequests.push(record)

        // Real adapters deliver the code via the provider here
        await provider.sendVerificationRequest({ identifier, url, token, baseUrl: 'http://localhost:3000', provider })

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
      async getUserByPhone (phone) {
        return state.users.find(u => u.phone === phone) || null
      },
      async createUser (profile) {
        const user = { id: `${state.users.length + 1}`, ...profile }
        state.users.push(user)
        return user
      },
      async updateUser (user) {
        const index = state.users.findIndex(u => `${u.id}` === `${user.id}`)
        state.users[index] = user
        return user
      },
      async createSession (user) {
        const session = { sessionToken: `tok-${Math.random().toString(36).slice(2)}`, userId: user.id, expires: new Date(Date.now() + 86400000) }
        state.sessions.push(session)
        return session
      }
    })
  }
}

function phoneProvider () {
  const sent = []
  const provider = Phone({
    sendVerificationRequest: ({ identifier: phone, token: code }) => {
      sent.push({ phone, code })
      return Promise.resolve()
    }
  })
  provider._sent = sent
  return provider
}

const baseOptions = (adapter, provider) => ({
  adapter,
  providers: [provider],
  secret: SECRET,
  cookies: defaultCookies(false),
  baseUrl: 'http://localhost:3000',
  basePath: '/api/auth',
  events: {
    signIn: () => {},
    signOut: () => {},
    createUser: () => {},
    updateUser: () => {}
  },
  callbacks: {
    signIn: () => true,
    jwt: (token) => token
  },
  jwt: {
    secret: SECRET,
    maxAge: 2592000,
    encode: jwt.encode,
    decode: jwt.decode
  },
  session: { jwt: true, maxAge: 2592000 },
  // fresh rate-limit store per test to keep cases isolated
  otp: { store: createMemoryStore() }
})

function mockReq ({ body = {}, headers = {} } = {}) {
  return {
    method: 'POST',
    body,
    headers,
    cookies: {},
    connection: { remoteAddress: '127.0.0.1' },
    options: {}
  }
}

function mockRes () {
  return {
    statusCode: 200,
    jsonBody: null,
    cookies: [],
    status (code) { this.statusCode = code; return this },
    json (data) { this.jsonBody = data; return this },
    getHeader () { return [] },
    setHeader (name, values) { this.cookies = this.cookies.concat(values) }
  }
}

describe('server/routes/otp', () => {
  describe('otpSend', () => {
    it('sends an OTP for a valid phone number', async () => {
      const adapter = fakeAdapter()
      const provider = phoneProvider()
      const req = mockReq({ body: { phone: '+8801712345678' } })
      req.options = baseOptions(adapter, provider)
      const res = mockRes()

      await otpSend(req, res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.ok, true)
      assert.strictEqual(provider._sent.length, 1)
      assert.match(provider._sent[0].code, /^\d{6}$/)
      assert.strictEqual(adapter.state.verificationRequests.length, 1)
    })

    it('normalizes formatting before sending', async () => {
      const adapter = fakeAdapter()
      const provider = phoneProvider()
      const req = mockReq({ body: { phone: '+880 171 234 5678' } })
      req.options = baseOptions(adapter, provider)
      const res = mockRes()

      await otpSend(req, res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(adapter.state.verificationRequests[0].identifier, '+8801712345678')
    })

    it('rejects invalid phone numbers with INVALID_PHONE', async () => {
      const adapter = fakeAdapter()
      const provider = phoneProvider()
      const req = mockReq({ body: { phone: '12345' } })
      req.options = baseOptions(adapter, provider)
      const res = mockRes()

      await otpSend(req, res)

      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.error.code, 'INVALID_PHONE')
      assert.strictEqual(provider._sent.length, 0)
    })

    it('enforces the resend cooldown per number', async () => {
      const adapter = fakeAdapter()
      const provider = phoneProvider()
      const options = baseOptions(adapter, provider)
      options.otp = { rateLimits: { resendCooldownSeconds: 60 } }

      const firstReq = mockReq({ body: { phone: '+8801712345678' } })
      firstReq.options = options
      const firstRes = mockRes()
      await otpSend(firstReq, firstRes)
      assert.strictEqual(firstRes.statusCode, 200)

      const secondReq = mockReq({ body: { phone: '+8801712345678' } })
      secondReq.options = options
      const secondRes = mockRes()
      await otpSend(secondReq, secondRes)

      assert.strictEqual(secondRes.statusCode, 429)
      assert.strictEqual(secondRes.jsonBody.error.code, 'RATE_LIMITED')
      assert.strictEqual(provider._sent.length, 1)
    })

    it('fails with CONFIGURATION_ERROR when no phone provider is configured', async () => {
      const adapter = fakeAdapter()
      const req = mockReq({ body: { phone: '+8801712345678' } })
      req.options = baseOptions(adapter)
      req.options.providers = []
      const res = mockRes()

      await otpSend(req, res)

      assert.strictEqual(res.statusCode, 500)
      assert.strictEqual(res.jsonBody.error.code, 'CONFIGURATION_ERROR')
    })
  })

  describe('otpVerify', () => {
    async function setupAndSend ({ phone = '+8801712345678' } = {}) {
      const adapter = fakeAdapter()
      const provider = phoneProvider()
      const options = baseOptions(adapter, provider)
      const sendReq = mockReq({ body: { phone } })
      sendReq.options = options
      const sendRes = mockRes()
      await otpSend(sendReq, sendRes)
      assert.strictEqual(sendRes.statusCode, 200)
      return { adapter, provider, options, code: provider._sent[0].code, phone }
    }

    it('verifies a valid code, creates the user and signs them in (JWT mode)', async () => {
      const { adapter, options, code } = await setupAndSend()

      const req = mockReq({ body: { phone: '+8801712345678', code } })
      req.options = options
      const res = mockRes()

      await otpVerify(req, res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.user.phone, '+8801712345678')
      assert.strictEqual(res.jsonBody.user.phoneVerified, true)
      assert.strictEqual(adapter.state.users.length, 1)

      // JWT session cookie was set and decodes to the new user
      const cookie = res.cookies.find(c => c.startsWith('isc-auth.session-token='))
      assert.ok(cookie, 'expected a session cookie')
      const nameValue = cookie.split(';')[0]
      const token = decodeURIComponent(nameValue.slice(nameValue.indexOf('=') + 1))
      const decoded = await jwt.decode({ token, secret: SECRET })
      assert.strictEqual(decoded.sub, '1')

      // code is single use
      assert.strictEqual(adapter.state.verificationRequests.length, 0)
    })

    it('rejects a wrong code with INVALID_TOKEN and keeps no session', async () => {
      const { adapter, options } = await setupAndSend()

      const req = mockReq({ body: { phone: '+8801712345678', code: '000000' } })
      req.options = options
      const res = mockRes()

      await otpVerify(req, res)

      assert.strictEqual(res.statusCode, 400)
      assert.strictEqual(res.jsonBody.error.code, 'INVALID_TOKEN')
      assert.strictEqual(adapter.state.users.length, 0)
    })

    it('reuses the existing account when the number is already registered', async () => {
      const { adapter, options, code } = await setupAndSend()
      adapter.state.users.push({ id: '9', name: 'Existing', email: null, image: null, phone: '+8801712345678', phoneVerified: true })

      const req = mockReq({ body: { phone: '+8801712345678', code } })
      req.options = options
      const res = mockRes()

      await otpVerify(req, res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.user.id, '9')
      assert.strictEqual(adapter.state.users.length, 1)
    })

    it('creates DB sessions when JWT sessions are disabled', async () => {
      const { adapter, options, code } = await setupAndSend()
      options.session.jwt = false

      const req = mockReq({ body: { phone: '+8801712345678', code } })
      req.options = options
      const res = mockRes()

      await otpVerify(req, res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(adapter.state.sessions.length, 1)
      const cookie = res.cookies.find(c => c.startsWith('isc-auth.session-token=tok-'))
      assert.ok(cookie, 'expected a db session cookie')
    })

    it('honors a signIn callback that denies access', async () => {
      const { options, code } = await setupAndSend()
      options.callbacks.signIn = () => false

      const req = mockReq({ body: { phone: '+8801712345678', code } })
      req.options = options
      const res = mockRes()

      await otpVerify(req, res)

      assert.strictEqual(res.statusCode, 403)
      assert.strictEqual(res.jsonBody.error.code, 'ACCESS_DENIED')
    })

    it('throttles repeated verification attempts per number', async () => {
      const { options } = await setupAndSend()

      let lastRes
      for (let i = 0; i < 6; i++) {
        const req = mockReq({ body: { phone: '+8801712345678', code: `00000${i}` } })
        req.options = options
        lastRes = mockRes()
        await otpVerify(req, lastRes)
      }

      assert.strictEqual(lastRes.statusCode, 429)
      assert.strictEqual(lastRes.jsonBody.error.code, 'RATE_LIMITED')
    })
  })
})
