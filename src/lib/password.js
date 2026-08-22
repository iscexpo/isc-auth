import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'

/**
 * Password hashing using Node's built-in scrypt (no external dependency).
 *
 * Hashes are stored in self-describing format:
 *   scrypt$N$r$p$<salt-hex>$<derived-key-hex>
 * so parameters can evolve without invalidating existing hashes.
 */

// OWASP-recommended minimums for scrypt (N=2^15 preferred; 2^14 keeps
// verification under ~100ms on low-end serverless hardware).
const DEFAULT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 64,
  saltLength: 16
}

function scrypt (password, salt, N, r, p, keyLength) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { N, r, p }, (error, derivedKey) => {
      if (error) { return reject(error) }
      return resolve(derivedKey)
    })
  })
}

export async function hashPassword (password, options = {}) {
  const { N, r, p, keyLength, saltLength } = { ...DEFAULT_OPTIONS, ...options }
  const salt = randomBytes(saltLength)
  const derivedKey = await scrypt(Buffer.from(password, 'utf8'), salt, N, r, p, keyLength)
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derivedKey.toString('hex')}`
}

export async function verifyPassword (password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') { return false }

  try {
    const parts = storedHash.split('$')
    if (parts.length !== 6) { return false }

    const [algorithm, rawN, rawR, rawP, salt, hash] = parts
    if (algorithm !== 'scrypt') { return false }

    const N = parseInt(rawN, 10)
    const r = parseInt(rawR, 10)
    const p = parseInt(rawP, 10)
    // keyLength is inferred from the stored hash length so hashes created
    // with different key lengths remain verifiable.
    const keyLength = hash.length / 2
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || keyLength < 1) {
      return false
    }

    const derivedKey = await scrypt(
      Buffer.from(password, 'utf8'),
      Buffer.from(salt, 'hex'),
      N, r, p, keyLength
    )
    const expected = Buffer.from(hash, 'hex')

    return derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected)
  } catch (error) {
    return false
  }
}
