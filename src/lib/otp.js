import { randomInt } from 'crypto'

/**
 * Generate a numeric one-time code with cryptographic randomness.
 * Returns e.g. '042917' for digits=6 (zero padded).
 */
export function generateOtp (digits = 6) {
  const min = 0
  const max = 10 ** digits
  return String(randomInt(min, max)).padStart(digits, '0')
}
