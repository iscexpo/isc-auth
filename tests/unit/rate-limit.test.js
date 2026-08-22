const assert = require('assert')
const { createRateLimiter, createMemoryStore } = require('../../dist/server/internal/rate-limit')

describe('server/internal/rate-limit', () => {
  it('allows requests up to the max and then denies', () => {
    const store = createMemoryStore()
    const limiter = createRateLimiter({ max: 3, windowMs: 60000, store })

    assert.strictEqual(limiter.check('k').allowed, true)
    assert.strictEqual(limiter.check('k').allowed, true)
    const third = limiter.check('k')
    assert.strictEqual(third.allowed, true)
    assert.strictEqual(third.remaining, 0)
    assert.strictEqual(limiter.check('k').allowed, false)
    // independent keys are unaffected
    assert.strictEqual(limiter.check('other').allowed, true)
  })

  it('resets the window once it has elapsed', () => {
    const store = createMemoryStore()
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, store })
    const t0 = 1000000

    assert.strictEqual(limiter.check('k', t0).allowed, true)
    assert.strictEqual(limiter.check('k', t0 + 500).allowed, false)
    assert.strictEqual(limiter.check('k', t0 + 1000).allowed, true)
  })

  it('reports the count within the window', () => {
    const store = createMemoryStore()
    const limiter = createRateLimiter({ max: 10, windowMs: 60000, store })

    limiter.check('k')
    limiter.check('k')
    const third = limiter.check('k')
    assert.strictEqual(third.count, 3)
    assert.strictEqual(third.remaining, 7)
  })

  it('reset() clears a key immediately', () => {
    const store = createMemoryStore()
    const limiter = createRateLimiter({ max: 1, windowMs: 60000, store })

    limiter.check('k')
    assert.strictEqual(limiter.check('k').allowed, false)
    limiter.reset('k')
    assert.strictEqual(limiter.check('k').allowed, true)
  })

  it('works with a custom shared store', () => {
    const calls = []
    const fakeStore = {
      incr (key, windowMs) {
        calls.push([key, windowMs])
        return 1
      },
      reset () {}
    }
    const limiter = createRateLimiter({ max: 1, windowMs: 1234, store: fakeStore })

    assert.strictEqual(limiter.check('user-key').allowed, true)
    assert.deepStrictEqual(calls[0], ['user-key', 1234])
  })

  it('memory store drops expired entries on sweep', () => {
    const store = createMemoryStore()
    const t0 = 5000000

    assert.strictEqual(store.incr('a', 100, t0), 1)
    // drive past the sweep trigger point (every 1000 increments) with a
    // timestamp beyond a's window so its entry gets collected
    let count = 1
    for (let i = 0; count < 1001 && i < 5000; i++) {
      count = store.incr('b', 60000, t0)
    }
    for (let i = 0; i < 999; i++) {
      store.incr(`key-${i}`, 60000, t0 + 200)
    }
    // 'a' was swept away, so this starts a brand new window
    assert.strictEqual(store.incr('a', 100, t0 + 200), 1)
  })
})
