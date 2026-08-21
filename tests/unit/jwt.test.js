const assert = require('assert')
const jwt = require('../../dist/lib/jwt').default

const secret = 'unit-test-secret'

describe('lib/jwt', () => {
  it('round-trips a token through encode/decode', async () => {
    const token = { name: 'Ada', email: 'ada@example.com' }
    const encoded = await jwt.encode({ token, secret })
    assert.strictEqual(typeof encoded, 'string')

    const decoded = await jwt.decode({ token: encoded, secret })
    assert.strictEqual(decoded.name, token.name)
    assert.strictEqual(decoded.email, token.email)
    assert.strictEqual(typeof decoded.iat, 'number')
    assert.strictEqual(typeof decoded.exp, 'number')
  })

  it('returns null when decoding an empty token', async () => {
    const decoded = await jwt.decode({ token: '', secret })
    assert.strictEqual(decoded, null)
  })

  it('rejects a tampered token', async () => {
    const encoded = await jwt.encode({ token: { name: 'Ada' }, secret })
    const tampered = encoded.slice(0, -2) + (encoded.endsWith('aa') ? 'bb' : 'aa')
    await assert.rejects(jwt.decode({ token: tampered, secret }))
  })
})
