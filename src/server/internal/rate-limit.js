/**
 * Fixed-window rate limiter with pluggable store.
 *
 * The default in-memory store protects a single process. For multi-instance
 * deployments pass a shared store implementing:
 *   incr(key, windowMs, now) -> count within current window
 *   reset(key)
 *   stop()  (optional)
 */

const SWEEP_THRESHOLD = 10000 // sweep when map grows beyond this many keys

export function createMemoryStore () {
  const hits = new Map()
  let ops = 0

  function sweep (now) {
    for (const [key, entry] of hits) {
      if (now >= entry.resetAt) { hits.delete(key) }
    }
  }

  return {
    incr (key, windowMs, now = Date.now()) {
      if (++ops % 1000 === 0 || hits.size > SWEEP_THRESHOLD) { sweep(now) }

      const entry = hits.get(key)
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs })
        return 1
      }
      entry.count += 1
      return entry.count
    },
    reset (key) {
      hits.delete(key)
    },
    stop () {}
  }
}

// Module-level shared store: survives across requests in the same process
// (including warm serverless instances). Instances that share no memory need
// to supply their own store via options.otp.store.
const sharedMemoryStore = createMemoryStore()

/**
 * Create a rate limiter bound to a maximum count per time window.
 * check(key) -> { allowed, count, remaining }
 */
export function createRateLimiter ({ max, windowMs, store } = {}) {
  const activeStore = store ?? sharedMemoryStore
  return {
    check (key, now = Date.now()) {
      const count = activeStore.incr(String(key), windowMs, now)
      return {
        allowed: count <= max,
        count,
        remaining: Math.max(0, max - count)
      }
    },
    reset (key) {
      activeStore.reset(String(key))
    },
    stop () {
      if (typeof activeStore.stop === 'function') { activeStore.stop() }
    }
  }
}
