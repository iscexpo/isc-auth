import { createHash, randomBytes } from 'crypto'

import require_optional from 'require_optional' // eslint-disable-line camelcase
import logger from '../../lib/logger'
import { CreateUserError } from '../../lib/errors'

/**
 * Drizzle adapter (https://orm.drizzle.team)
 *
 * Works with any SQL dialect Drizzle supports (Postgres, MySQL, SQLite…) as
 * long as the tables follow src/adapters/drizzle/schema.js.
 *
 *   import Adapters from 'isc-auth/adapters'
 *   import { drizzle } from 'drizzle-orm/node-postgres'
 *   import * as schema from './auth-schema'
 *
 *   adapter: Adapters.Drizzle({
 *     db: drizzle(process.env.DATABASE_URL),
 *     tables: {
 *       users: schema.users,
 *       accounts: schema.accounts,
 *       sessions: schema.sessions,
 *       verificationRequests: schema.verificationRequests
 *     }
 *   })
 *
 * drizzle-orm is loaded lazily so the rest of isc-auth does not require it.
 */
export const Adapter = ({ db, tables } = {}) => {
  const { users, accounts, sessions, verificationRequests } = tables ?? {}

  async function getAdapter (appOptions) {
    // Loaded here rather than at module scope so that applications not using
    // this adapter do not need drizzle-orm installed
    const { eq, and } = require_optional('drizzle-orm')

    if (!db || !users || !accounts || !sessions || !verificationRequests) {
      throw new Error('DRIZZLE_ADAPTER_CONFIGURATION_ERROR')
    }

    function debug (debugCode, ...args) {
      logger.debug(`DRIZZLE_${debugCode}`, ...args)
    }

    const defaultSessionMaxAge = 30 * 24 * 60 * 60 * 1000
    const sessionMaxAge = (appOptions && appOptions.session && appOptions.session.maxAge)
      ? appOptions.session.maxAge * 1000
      : defaultSessionMaxAge
    const sessionUpdateAge = (appOptions && appOptions.session && appOptions.session.updateAge)
      ? appOptions.session.updateAge * 1000
      : 0

    /** Return the first row of a select builder or null */
    async function firstRow (query) {
      const rows = await query.limit(1)
      return rows[0] ?? null
    }

    async function createUser (profile) {
      debug('CREATE_USER', profile)
      try {
        return await db.insert(users).values({
          name: profile.name ?? null,
          email: profile.email ?? null,
          emailVerified: profile.emailVerified ?? null,
          image: profile.image ?? null,
          passwordHash: profile.passwordHash ?? null,
          phone: profile.phone ?? null,
          phoneVerified: profile.phoneVerified ?? null,
          createdAt: new Date(),
          updatedAt: new Date()
        }).returning().then(rows => rows[0])
      } catch (error) {
        logger.error('CREATE_USER_ERROR', error)
        return Promise.reject(new CreateUserError(error))
      }
    }

    async function getUser (id) {
      debug('GET_USER', id)
      try {
        return await firstRow(db.select().from(users).where(eq(users.id, id)))
      } catch (error) {
        logger.error('GET_USER_BY_ID_ERROR', error)
        return Promise.reject(new Error('GET_USER_BY_ID_ERROR'))
      }
    }

    async function getUserByEmail (email) {
      debug('GET_USER_BY_EMAIL', email)
      try {
        if (!email) { return null }
        return await firstRow(db.select().from(users).where(eq(users.email, email)))
      } catch (error) {
        logger.error('GET_USER_BY_EMAIL_ERROR', error)
        return Promise.reject(new Error('GET_USER_BY_EMAIL_ERROR'))
      }
    }

    async function getUserByPhone (phone) {
      debug('GET_USER_BY_PHONE', phone)
      try {
        if (!phone) { return null }
        return await firstRow(db.select().from(users).where(eq(users.phone, phone)))
      } catch (error) {
        logger.error('GET_USER_BY_PHONE_ERROR', error)
        return Promise.reject(new Error('GET_USER_BY_PHONE_ERROR'))
      }
    }

    async function getUserByProviderAccountId (providerId, providerAccountId) {
      debug('GET_USER_BY_PROVIDER_ACCOUNT_ID', providerId, providerAccountId)
      try {
        const account = await firstRow(
          db.select().from(accounts).where(
            and(eq(accounts.providerId, providerId), eq(accounts.providerAccountId, providerAccountId))
          )
        )
        if (!account) { return null }
        return getUser(account.userId)
      } catch (error) {
        logger.error('GET_USER_BY_PROVIDER_ACCOUNT_ID_ERROR', error)
        return Promise.reject(new Error('GET_USER_BY_PROVIDER_ACCOUNT_ID_ERROR'))
      }
    }

    async function updateUser (user) {
      debug('UPDATE_USER', user)
      try {
        const rows = await db.update(users).set({
          name: user.name ?? null,
          email: user.email ?? null,
          emailVerified: user.emailVerified ?? null,
          image: user.image ?? null,
          passwordHash: user.passwordHash ?? null,
          phone: user.phone ?? null,
          phoneVerified: user.phoneVerified ?? null,
          updatedAt: new Date()
        }).where(eq(users.id, user.id)).returning()
        return rows[0] ?? user
      } catch (error) {
        logger.error('UPDATE_USER_ERROR', error)
        return Promise.reject(new Error('UPDATE_USER_ERROR'))
      }
    }

    async function deleteUser (userId) {
      debug('DELETE_USER', userId)
      try {
        await db.delete(users).where(eq(users.id, userId))
        return true
      } catch (error) {
        logger.error('DELETE_USER_ERROR', error)
        return false
      }
    }

    async function linkAccount (userId, providerId, providerType, providerAccountId, refreshToken, accessToken, accessTokenExpires) {
      debug('LINK_ACCOUNT', userId, providerId, providerType, providerAccountId)
      try {
        const now = new Date()
        const compoundId = createHash('sha256').update(`${providerId}:${providerAccountId}`).digest('hex')
        const rows = await db.insert(accounts).values({
          compoundId,
          userId,
          providerType,
          providerId,
          providerAccountId,
          refreshToken: refreshToken ?? null,
          accessToken: accessToken ?? null,
          accessTokenExpires: accessTokenExpires ?? null,
          createdAt: now,
          updatedAt: now
        }).returning()
        return rows[0]
      } catch (error) {
        logger.error('LINK_ACCOUNT_ERROR', error)
        return Promise.reject(new Error('LINK_ACCOUNT_ERROR'))
      }
    }

    async function unlinkAccount (userId, providerId, providerAccountId) {
      debug('UNLINK_ACCOUNT', userId, providerId, providerAccountId)
      try {
        await db.delete(accounts).where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, providerId),
            eq(accounts.providerAccountId, providerAccountId)
          )
        )
      } catch (error) {
        logger.error('UNLINK_ACCOUNT_ERROR', error)
        return Promise.reject(new Error('UNLINK_ACCOUNT_ERROR'))
      }
    }

    async function createSession (user) {
      debug('CREATE_SESSION', user)
      try {
        let expires = null
        if (sessionMaxAge) {
          const dateExpires = new Date()
          dateExpires.setTime(dateExpires.getTime() + sessionMaxAge)
          expires = dateExpires
        }

        const now = new Date()
        const rows = await db.insert(sessions).values({
          sessionToken: randomBytes(32).toString('hex'),
          userId: user.id,
          accessToken: randomBytes(32).toString('hex'),
          expires,
          createdAt: now,
          updatedAt: now
        }).returning()

        return rows[0]
      } catch (error) {
        logger.error('CREATE_SESSION_ERROR', error)
        return Promise.reject(new Error('CREATE_SESSION_ERROR'))
      }
    }

    async function getSession (sessionToken) {
      debug('GET_SESSION', sessionToken)
      try {
        const session = await firstRow(db.select().from(sessions).where(eq(sessions.sessionToken, sessionToken)))

        // Check session has not expired (do not return it if it has)
        if (session && session.expires && new Date() > new Date(session.expires)) {
          await deleteSession(sessionToken)
          return null
        }

        return session
      } catch (error) {
        logger.error('GET_SESSION_ERROR', error)
        return Promise.reject(new Error('GET_SESSION_ERROR'))
      }
    }

    async function updateSession (session, force) {
      debug('UPDATE_SESSION', session, force)
      try {
        if (sessionMaxAge && (sessionUpdateAge || sessionUpdateAge === 0) && session.expires) {
          // Calculate last updated date, to throttle write updates to database
          // Formula: ({expiry date} - sessionMaxAge) + sessionUpdateAge
          //   e.g. ({expiry date} - 30 days) + 1 hour
          const dateSessionIsDueToBeUpdated = new Date(session.expires)
          dateSessionIsDueToBeUpdated.setTime(dateSessionIsDueToBeUpdated.getTime() - sessionMaxAge)
          dateSessionIsDueToBeUpdated.setTime(dateSessionIsDueToBeUpdated.getTime() + sessionUpdateAge)

          // Trigger update of session expiry only if the session was last
          // updated more than {sessionUpdateAge} ago
          if (new Date() > dateSessionIsDueToBeUpdated) {
            const newExpiryDate = new Date()
            newExpiryDate.setTime(newExpiryDate.getTime() + sessionMaxAge)
            session.expires = newExpiryDate
          } else if (!force) {
            return null
          }
        } else {
          // If session MaxAge, session UpdateAge or session.expires are
          // missing then don't even try to save changes, unless force is set.
          if (!force) { return null }
        }

        const rows = await db.update(sessions).set({ expires: session.expires, updatedAt: new Date() })
          .where(eq(sessions.sessionToken, session.sessionToken)).returning()
        return rows[0] ?? session
      } catch (error) {
        logger.error('UPDATE_SESSION_ERROR', error)
        return Promise.reject(new Error('UPDATE_SESSION_ERROR'))
      }
    }

    async function deleteSession (sessionToken) {
      debug('DELETE_SESSION', sessionToken)
      try {
        await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken))
      } catch (error) {
        logger.error('DELETE_SESSION_ERROR', error)
        return Promise.reject(new Error('DELETE_SESSION_ERROR'))
      }
    }

    async function createVerificationRequest (identifier, url, token, secret, provider) {
      debug('CREATE_VERIFICATION_REQUEST', identifier)
      try {
        const { baseUrl } = appOptions
        const { sendVerificationRequest, maxAge } = provider

        // Store hashed token (using secret as salt) so tokens cannot be
        // exploited even if the contents of the database is compromised.
        const hashedToken = createHash('sha256').update(`${token}${secret}`).digest('hex')

        let expires = null
        if (maxAge) {
          const dateExpires = new Date()
          dateExpires.setTime(dateExpires.getTime() + (maxAge * 1000))
          expires = dateExpires
        }

        // A newer request replaces any older one for the same identifier
        await db.delete(verificationRequests).where(eq(verificationRequests.identifier, identifier))

        const now = new Date()
        const rows = await db.insert(verificationRequests).values({ identifier, token: hashedToken, expires, createdAt: now, updatedAt: now }).returning()
        const verificationRequest = rows[0]

        await sendVerificationRequest({ identifier, url, token, baseUrl, provider })

        return verificationRequest
      } catch (error) {
        logger.error('CREATE_VERIFICATION_REQUEST_ERROR', error)
        return Promise.reject(new Error('CREATE_VERIFICATION_REQUEST_ERROR'))
      }
    }

    async function getVerificationRequest (identifier, token, secret, provider) {
      debug('GET_VERIFICATION_REQUEST', identifier, token)
      try {
        // Hash token provided with secret before trying to match it with database
        const hashedToken = createHash('sha256').update(`${token}${secret}`).digest('hex')
        const verificationRequest = await firstRow(
          db.select().from(verificationRequests).where(
            and(
              eq(verificationRequests.identifier, identifier),
              eq(verificationRequests.token, hashedToken)
            )
          )
        )

        if (verificationRequest && verificationRequest.expires && new Date() > new Date(verificationRequest.expires)) {
          // Delete verification entry so it cannot be used again
          await deleteVerificationRequest(identifier, token, secret, provider)
          return null
        }

        return verificationRequest
      } catch (error) {
        logger.error('GET_VERIFICATION_REQUEST_ERROR', error)
        return Promise.reject(new Error('GET_VERIFICATION_REQUEST_ERROR'))
      }
    }

    async function deleteVerificationRequest (identifier, token, secret, provider) {
      debug('DELETE_VERIFICATION', identifier, token)
      try {
        // Delete verification entry so it cannot be used again
        const hashedToken = createHash('sha256').update(`${token}${secret}`).digest('hex')
        await db.delete(verificationRequests).where(eq(verificationRequests.token, hashedToken))
      } catch (error) {
        logger.error('DELETE_VERIFICATION_REQUEST_ERROR', error)
        return Promise.reject(new Error('DELETE_VERIFICATION_REQUEST_ERROR'))
      }
    }

    return Promise.resolve({
      createUser,
      getUser,
      getUserByEmail,
      getUserByPhone,
      getUserByProviderAccountId,
      updateUser,
      deleteUser,
      linkAccount,
      unlinkAccount,
      createSession,
      getSession,
      updateSession,
      deleteSession,
      createVerificationRequest,
      getVerificationRequest,
      deleteVerificationRequest
    })
  }

  return {
    getAdapter
  }
}

export default {
  Adapter
}
