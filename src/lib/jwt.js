import { SignJWT } from 'jose/jwt/sign'
import { jwtVerify } from 'jose/jwt/verify'
import { importJWK } from 'jose/key/import'
import { compactEncrypt } from 'jose/jwe/compact/encrypt'
import { compactDecrypt } from 'jose/jwe/compact/decrypt'
import hkdf from 'futoin-hkdf'
import logger from './logger'

const CompactEncrypt = compactEncrypt

// Set default algorithm to use for auto-generated signing key
const DEFAULT_SIGNATURE_ALGORITHM = 'HS512'

// Set default algorithm for auto-generated symmetric encryption key
const DEFAULT_ENCRYPTION_ALGORITHM = 'A256GCM'

// Use encryption or not by default
const DEFAULT_ENCRYPTION_ENABLED = false

const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

async function encode ({
  token = {},
  maxAge = DEFAULT_MAX_AGE,
  secret,
  signingKey,
  signingOptions = {
    expiresIn: `${maxAge}s`
  },
  encryptionKey,
  encryptionOptions = {
    alg: 'dir',
    enc: DEFAULT_ENCRYPTION_ALGORITHM,
    zip: 'DEF'
  },
  encryption = DEFAULT_ENCRYPTION_ENABLED
} = {}) {
  // Signing Key
  const _signingKey = signingKey
    ? await importJWK(JSON.parse(signingKey))
    : await getDerivedSigningKey(secret)

  // Sign token
  const signedToken = await new SignJWT(token)
    .setProtectedHeader({ alg: DEFAULT_SIGNATURE_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(signingOptions.expiresIn ?? `${maxAge}s`)
    .sign(_signingKey)

  if (encryption) {
    // Encryption Key
    const _encryptionKey = encryptionKey
      ? await importJWK(JSON.parse(encryptionKey))
      : await getDerivedEncryptionKey(secret)

    // Encrypt token
    return await new CompactEncrypt(
      new TextEncoder().encode(signedToken),
      _encryptionKey
    )
      .setProtectedHeader({
        alg: encryptionOptions.alg,
        enc: encryptionOptions.enc,
        zip: encryptionOptions.zip
      })
      .encrypt()
  }
  return signedToken
}

async function decode ({
  secret,
  token,
  maxAge = DEFAULT_MAX_AGE,
  signingKey,
  verificationKey = signingKey, // Optional (defaults to encryptionKey)
  verificationOptions = {
    maxTokenAge: `${maxAge}s`,
    algorithms: [DEFAULT_SIGNATURE_ALGORITHM]
  },
  encryptionKey,
  decryptionKey = encryptionKey, // Optional (defaults to encryptionKey)
  decryptionOptions = {
    algorithms: [DEFAULT_ENCRYPTION_ALGORITHM]
  },
  encryption = DEFAULT_ENCRYPTION_ENABLED
} = {}) {
  if (!token) return null

  let tokenToVerify = token

  if (encryption) {
    // Encryption Key
    const _encryptionKey = decryptionKey
      ? await importJWK(JSON.parse(decryptionKey))
      : await getDerivedEncryptionKey(secret)

    // Decrypt token
    const { plaintext } = await compactDecrypt(token, _encryptionKey)
    tokenToVerify = new TextDecoder().decode(plaintext)
  }

  // Signing Key
  const _signingKey = verificationKey
    ? await importJWK(JSON.parse(verificationKey))
    : await getDerivedSigningKey(secret)

  // Verify token
  const { payload } = await jwtVerify(tokenToVerify, _signingKey, {
    algorithms: verificationOptions.algorithms,
    maxTokenAge: verificationOptions.maxTokenAge
  })
  return payload
}

/**
 * Server-side method to retrieve the JWT from `req`.
 * @param {{
 * req: NextApiRequest
 * secureCookie?: boolean
 * cookieName?: string
 * raw?: boolean
 * }} params
 */
async function getToken (params) {
  const {
    req,
    // Use secure prefix for cookie name, unless URL is ISCAUTH_URL is http://
    // or not set (e.g. development or test instance) case use unprefixed name
    secureCookie = !(!process.env.ISCAUTH_URL || process.env.ISCAUTH_URL.startsWith('http://')),
    cookieName = (secureCookie) ? '__Secure-isc-auth.session-token' : 'isc-auth.session-token',
    raw = false
  } = params
  if (!req) throw new Error('Must pass `req` to JWT getToken()')

  // Try to get token from cookie
  let token = req.cookies[cookieName]

  // If cookie not found in cookie look for bearer token in authorization header.
  // This allows clients that pass through tokens in headers rather than as
  // cookies to use this helper function.
  if (!token && req.headers.authorization?.split(' ')[0] === 'Bearer') {
    const urlEncodedToken = req.headers.authorization.split(' ')[1]
    token = decodeURIComponent(urlEncodedToken)
  }

  if (raw) {
    return token
  }

  try {
    return decode({ token, ...params })
  } catch {
    return null
  }
}

// Generate warning (but only once at startup) when auto-generated keys are used
let DERIVED_SIGNING_KEY_WARNING = false
let DERIVED_ENCRYPTION_KEY_WARNING = false

async function getDerivedSigningKey (secret) {
  if (!DERIVED_SIGNING_KEY_WARNING) {
    logger.warn('JWT_AUTO_GENERATED_SIGNING_KEY')
    DERIVED_SIGNING_KEY_WARNING = true
  }

  const buffer = hkdf(secret, 64, { info: 'ISCAuth Generated Signing Key', hash: 'SHA-256' })
  return importJWK({
    kty: 'oct',
    k: Buffer.from(buffer).toString('base64url'),
    alg: DEFAULT_SIGNATURE_ALGORITHM,
    use: 'sig',
    kid: 'iscauth-auto-generated-signing-key'
  })
}

async function getDerivedEncryptionKey (secret) {
  if (!DERIVED_ENCRYPTION_KEY_WARNING) {
    logger.warn('JWT_AUTO_GENERATED_ENCRYPTION_KEY')
    DERIVED_ENCRYPTION_KEY_WARNING = true
  }

  const buffer = hkdf(secret, 32, { info: 'ISCAuth Generated Encryption Key', hash: 'SHA-256' })
  return importJWK({
    kty: 'oct',
    k: Buffer.from(buffer).toString('base64url'),
    alg: DEFAULT_ENCRYPTION_ALGORITHM,
    use: 'enc',
    kid: 'iscauth-auto-generated-encryption-key'
  })
}

export default {
  encode,
  decode,
  getToken
}
