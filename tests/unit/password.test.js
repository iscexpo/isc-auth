const assert = require('assert')
const { hashPassword, verifyPassword } = require('../../dist/lib/password')

describe('lib/password', () => {
  const password = 'correct horse battery staple'

  it('hashes a password in self-describing scrypt format', async () => {
    const hash = await hashPassword(password)
    assert.match(hash, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
  })

  it('verifies the correct password', async () => {
    const hash = await hashPassword(password)
    assert.strictEqual(await verifyPassword(password, hash), true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword(password)
    assert.strictEqual(await verifyPassword('wrong password', hash), false)
  })

  it('generates a unique salt per hash', async () => {
    const [hash1, hash2] = await Promise.all([hashPassword(password), hashPassword(password)])
    assert.notStrictEqual(hash1, hash2)
  })

  it('supports custom parameters and verifies them back', async () => {
    const hash = await hashPassword(password, { N: 2048, r: 8, p: 1, keyLength: 32 })
    assert.match(hash, /^scrypt\$2048\$/)
    assert.strictEqual(await verifyPassword(password, hash), true)
    assert.strictEqual(await verifyPassword('nope', hash), false)
  })

  it('returns false for malformed or foreign hashes', async () => {
    assert.strictEqual(await verifyPassword(password, ''), false)
    assert.strictEqual(await verifyPassword(password, null), false)
    assert.strictEqual(await verifyPassword(password, 'not-a-hash'), false)
    // bcrypt-style hashes are not scrypt
    assert.strictEqual(await verifyPassword(password, '$2b$10$somebcrypthashvalue'), false)
  })
})
