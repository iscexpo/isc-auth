/**
 * Example Drizzle schemas for isc-auth.
 *
 * Copy the dialect you need and pass the tables to the adapter:
 *
 *   import { drizzle } from 'drizzle-orm/node-postgres'
 *   import * as schema from './schema'
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
 * Column names (JS properties) must match the ones below - the adapter
 * queries these fields directly.
 */
import { pgTable, serial, varchar, timestamp, integer, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).unique(),
  emailVerified: timestamp('email_verified'),
  image: varchar('image', { length: 255 }),
  passwordHash: varchar('password_hash', { length: 255 }),
  phone: varchar('phone', { length: 32 }),
  phoneVerified: timestamp('phone_verified'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  compoundId: varchar('compound_id', { length: 255 }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  providerType: varchar('provider_type', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  accessTokenExpires: timestamp('access_token_expires'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  sessionToken: varchar('session_token', { length: 255 }).notNull().unique(),
  userId: integer('user_id').notNull().references(() => users.id),
  accessToken: varchar('access_token', { length: 255 }).notNull(),
  expires: timestamp('expires').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export const verificationRequests = pgTable('verification_requests', {
  id: serial('id').primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expires: timestamp('expires').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
})
