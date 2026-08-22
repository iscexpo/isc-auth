const assert = require('assert')
const { isValidEmail, checkPassword, normalizePhone, isValidPhone } = require('../../dist/lib/validation')

describe('lib/validation', () => {
  describe('isValidEmail', () => {
    it('accepts ordinary addresses', () => {
      assert.strictEqual(isValidEmail('ada@example.com'), true)
      assert.strictEqual(isValidEmail('ada+tag@sub.example.co.uk'), true)
    })

    it('rejects malformed values', () => {
      assert.strictEqual(isValidEmail(null), false)
      assert.strictEqual(isValidEmail(undefined), false)
      assert.strictEqual(isValidEmail(42), false)
      assert.strictEqual(isValidEmail(''), false)
      assert.strictEqual(isValidEmail('no-at-sign'), false)
      assert.strictEqual(isValidEmail('a@b'), false)
      assert.strictEqual(isValidEmail('two words@example.com'), false)
    })

    it('rejects absurdly long addresses', () => {
      const local = 'a'.repeat(250)
      assert.strictEqual(isValidEmail(`${local}@example.com`), false)
    })
  })

  describe('checkPassword', () => {
    it('returns null for acceptable passwords', () => {
      assert.strictEqual(checkPassword('longenough1'), null)
      assert.strictEqual(checkPassword('short', { minLength: 5 }), null)
    })

    it('rejects short passwords with the policy length in the reason', () => {
      const problem = checkPassword('abc')
      assert.strictEqual(typeof problem, 'string')
      assert.match(problem, /at least 8/)
    })

    it('honors a custom minLength', () => {
      assert.match(checkPassword('abcdef', { minLength: 12 }), /at least 12/)
    })

    it('rejects non-string input', () => {
      assert.ok(checkPassword(undefined))
      assert.ok(checkPassword(null))
      assert.ok(checkPassword(12345678))
    })

    it('rejects passwords beyond the DoS guard', () => {
      assert.match(checkPassword('x'.repeat(2000)), /no more than 1024/)
    })
  })

  describe('normalizePhone / isValidPhone', () => {
    it('accepts valid E.164 numbers unchanged', () => {
      assert.strictEqual(normalizePhone('+8801712345678'), '+8801712345678')
      assert.strictEqual(normalizePhone('+14155552671'), '+14155552671')
    })

    it('strips formatting characters', () => {
      assert.strictEqual(normalizePhone('+1 (415) 555-2671'), '+14155552671')
      assert.strictEqual(normalizePhone('+880 171 234 5678'), '+8801712345678')
    })

    it('converts a 00 international prefix to +', () => {
      assert.strictEqual(normalizePhone('008801712345678'), '+8801712345678')
    })

    it('rejects numbers without a country code', () => {
      assert.strictEqual(normalizePhone('01712345678'), null)
      assert.strictEqual(normalizePhone('1712345678'), null)
    })

    it('rejects invalid values', () => {
      assert.strictEqual(normalizePhone(null), null)
      assert.strictEqual(normalizePhone('hello'), null)
      assert.strictEqual(normalizePhone('+'), null)
      assert.strictEqual(normalizePhone('+123'), null) // too short
      assert.strictEqual(normalizePhone('+0123456789'), null) // leading 0
      assert.strictEqual(isValidPhone(undefined), false)
      assert.strictEqual(isValidPhone('+8801712345678'), true)
    })
  })
})
