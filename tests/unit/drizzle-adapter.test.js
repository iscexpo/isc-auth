const assert = require('assert')
const Database = require('better-sqlite3')
const { drizzle } = require('drizzle-orm/better-sqlite3')
const { integer, sqliteTable, text } = require('drizzle-orm/sqlite-core')

const Drizzle = require('../../dist/adapters/drizzle').default

/** Mirror src/adapters/drizzle/schema.js on SQLite */
const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  email: text('email'),
  emailVerified: integer('email_verified', { mode: 'timestamp' }),
  image: text('image'),
  passwordHash: text('password_hash'),
  phone: text('phone'),
  phoneVerified: integer('phone_verified', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  compoundId: text('compound_id').notNull(),
  userId: integer('user_id').notNull(),
  providerType: text('provider_type').notNull(),
  providerId: text('provider_id').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  accessTokenExpires: integer('access_token_expires', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
const sessionsTable = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionToken: text('session_token').notNull(),
  userId: integer('user_id').notNull(),
  accessToken: text('access_token').notNull(),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
const verificationRequests = sqliteTable('verification_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

function makeTestDb () {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE users (
      id integer primary key autoincrement,
      name text, email text, email_verified integer,
      image text, password_hash text, phone text, phone_verified integer,
      created_at integer not null, updated_at integer not null
    );
    CREATE UNIQUE INDEX users_email_unique ON users (email);
    CREATE TABLE accounts (
      id integer primary key autoincrement,
      compound_id text not null, user_id integer not null,
      provider_type text not null, provider_id text not null, provider_account_id text not null,
      refresh_token text, access_token text, access_token_expires integer,
      created_at integer not null, updated_at integer not null
    );
    CREATE TABLE sessions (
      id integer primary key autoincrement,
      session_token text not null, user_id integer not null, access_token text not null,
      expires integer not null,
      created_at integer not null, updated_at integer not null
    );
    CREATE UNIQUE INDEX sessions_token_unique ON sessions (session_token);
    CREATE TABLE verification_requests (
      id integer primary key autoincrement,
      identifier text not null, token text not null, expires integer not null,
      created_at integer not null, updated_at integer not null
    );
    CREATE UNIQUE INDEX vr_token_unique ON verification_requests (token);
  `)

  const db = drizzle(raw)
  const config = {
    db,
    tables: { users, accounts, sessions: sessionsTable, verificationRequests }
  }
  return { raw, db, config }
}

const APP_OPTIONS = { baseUrl: 'http://localhost:3000', session: { maxAge: 3600 } }

describe('adapters/drizzle', () => {
  let adapter
  let testDb

  beforeEach(async () => {
    testDb = makeTestDb()
    adapter = await Drizzle.Adapter(testDb.config).getAdapter(APP_OPTIONS)
  })

  describe('users', () => {
    it('creates, finds and updates a user', async () => {
      const user = await adapter.createUser({
        name: 'Ada',
        email: 'ada@example.com',
        passwordHash: 'scrypt$1$2$3$ab$cd'
      })
      assert.ok(user.id)

      const byId = await adapter.getUser(user.id)
      assert.strictEqual(byId.email, 'ada@example.com')
      assert.strictEqual(byId.passwordHash, 'scrypt$1$2$3$ab$cd')

      const byEmail = await adapter.getUserByEmail('ada@example.com')
      assert.strictEqual(`${byEmail.id}`, `${user.id}`)

      assert.strictEqual(await adapter.getUserByEmail('missing@example.com'), null)
      assert.strictEqual(await adapter.getUserByEmail(null), null)
    })

    it('finds users by phone', async () => {
      await adapter.createUser({ phone: '+8801712345678', phoneVerified: new Date() })
      const found = await adapter.getUserByPhone('+8801712345678')
      assert.ok(found)
      assert.strictEqual(await adapter.getUserByPhone('+8801700000000'), null)
      assert.strictEqual(await adapter.getUserByPhone(null), null)
    })

    it('updates fields including phone verification', async () => {
      const user = await adapter.createUser({ name: 'Bob' })
      const verifiedAt = new Date()
      const updated = await adapter.updateUser({ ...user, name: 'Robert', phone: '+14155552671', phoneVerified: verifiedAt })

      assert.strictEqual(updated.name, 'Robert')
      const refetched = await adapter.getUser(user.id)
      assert.strictEqual(refetched.phone, '+14155552671')
      assert.ok(refetched.phoneVerified)
    })

    it('deletes a user', async () => {
      const user = await adapter.createUser({ name: 'Temp' })
      assert.strictEqual(await adapter.deleteUser(user.id), true)
      assert.strictEqual(await adapter.getUser(user.id), null)
    })
  })

  describe('accounts', () => {
    it('links an OAuth account and finds the user by provider account', async () => {
      const user = await adapter.createUser({ email: 'gh@example.com' })
      await adapter.linkAccount(user.id, 'github', 'oauth', '424242', 'rt', 'at', new Date())

      const found = await adapter.getUserByProviderAccountId('github', '424242')
      assert.strictEqual(`${found.id}`, `${user.id}`)
      assert.strictEqual(await adapter.getUserByProviderAccountId('github', 'nope'), null)
    })
  })

  describe('sessions', () => {
    it('creates, reads, updates and deletes sessions', async () => {
      const user = await adapter.createUser({ email: 's@example.com' })
      const session = await adapter.createSession(user)

      assert.match(session.sessionToken, /^[0-9a-f]{64}$/)

      const fetched = await adapter.getSession(session.sessionToken)
      assert.strictEqual(`${fetched.userId}`, `${user.id}`)

      // updateSession without force may skip (throttled) but must not throw
      await adapter.updateSession(session, false)

      const forced = await adapter.updateSession(session, true)
      assert.ok(forced)

      await adapter.deleteSession(session.sessionToken)
      assert.strictEqual(await adapter.getSession(session.sessionToken), null)
    })

    it('does not return expired sessions', async () => {
      const { db, config } = testDb
      const user = await adapter.createUser({ email: 'x@example.com' })
      const session = await adapter.createSession(user)
      // force the stored expiry into the past directly in the database
      const expiredAt = new Date(Date.now() - 60000)
      await db.update(config.tables.sessions)
        .set({ expires: expiredAt })
        .where(require('drizzle-orm').eq(config.tables.sessions.sessionToken, session.sessionToken))

      assert.strictEqual(await adapter.getSession(session.sessionToken), null)
    })
  })

  describe('verification requests', () => {
    const provider = (maxAge, sent) => ({
      maxAge,
      sendVerificationRequest: ({ identifier, token }) => sent.push({ identifier, token })
    })

    it('stores hashed tokens and delivers via the provider', async () => {
      const sent = []
      await adapter.createVerificationRequest('+8801712345678', '', '123456', 'secret', provider(300, sent))

      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].identifier, '+8801712345678')
      assert.strictEqual(sent[0].token, '123456')

      const request = await adapter.getVerificationRequest('+8801712345678', '123456', 'secret', provider(300, []))
      assert.ok(request)
      assert.notStrictEqual(request.token, '123456')
    })

    it('rejects wrong tokens and expired requests', async () => {
      const sent = []
      await adapter.createVerificationRequest('a@example.com', '', '111111', 'secret', provider(-1, sent))

      // already expired due to negative maxAge
      assert.strictEqual(await adapter.getVerificationRequest('a@example.com', '111111', 'secret', provider(-1, [])), null)
      // unknown token
      assert.strictEqual(await adapter.getVerificationRequest('a@example.com', '222222', 'secret', provider(300, [])), null)
    })

    it('replaces older requests for the same identifier and deletes after use', async () => {
      const noop = []
      await adapter.createVerificationRequest('b@example.com', '', '000001', 'secret', provider(300, noop))
      await adapter.createVerificationRequest('b@example.com', '', '000002', 'secret', provider(300, noop))

      // first code no longer verifiable, second one is
      assert.strictEqual(await adapter.getVerificationRequest('b@example.com', '000001', 'secret', provider(300, [])), null)
      assert.ok(await adapter.getVerificationRequest('b@example.com', '000002', 'secret', provider(300, [])))

      await adapter.deleteVerificationRequest('b@example.com', '000002', 'secret', provider(300, []))
      assert.strictEqual(await adapter.getVerificationRequest('b@example.com', '000002', 'secret', provider(300, [])), null)
    })
  })
})
