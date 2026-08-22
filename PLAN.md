# Implementation Plan — Closing Better Auth Parity Gaps (isc-auth 1.0.1)

Gap analysis reference: phone OTP, user registration, Drizzle adapter, password
management, and client/session compatibility with the Better Auth API surface.

## Verified facts

- Cookie names (`src/server/internal/cookie.js`, mirrored in `dist/`):
  `__Secure-isc-auth.session-token`, `isc-auth.callback-url`,
  `__Host-isc-auth.csrf-token`. `userOptions.cookies` already overrides these
  (`src/core/index.js`) — cookie compat is a config/export task, not a rewrite.
- No password column exists anywhere (TypeORM models: `user`, `account`,
  `session`, `verification-request`). Password infrastructure must land before
  `signUpEmail(password)` / `changePassword` / `resetPassword`.
- Adapter contract = `getAdapter(appOptions)` returning `{ createUser, getUser,
  getUserByEmail, getUserByProviderAccountId, updateUser, deleteUser,
  linkAccount, createSession, getSession, updateSession, deleteSession,
  createVerificationRequest, getVerificationRequest, deleteVerificationRequest }`.
- `useSession` returns `[data, loading]`; switching to `{ data, isPending }` is
  a breaking change → needs versioning decision.

---

## Phase 0 — ✅ DONE — Foundations

| Task | Files |
|---|---|
| Add password hashing util (scrypt via node `crypto` — no new dep; format `scrypt$N$r$p$salt$hash`) | new `src/lib/password.js` |
| Add `passwordHash` + `phone` + `phoneVerified` columns to user models | `src/adapters/typeorm/models/user.js`, Prisma schema example, Fauna index |
| Standardized error codes (Better Auth-style: `INVALID_PASSWORD`, `USER_EXISTS`, `RATE_LIMITED`…) returned as JSON, not redirects, for API-style routes | extend `src/lib/errors.js` |
| JSON-response helper for new API routes | new `src/server/internal/respond-json.js` |

**Exit criteria:** `npm run test:unit` passes; migration SQL/schema files updated
for MySQL/Postgres/MSSQL/Mongo fixtures.

---

## Phase 1 — ✅ DONE — User registration (`signUpEmail`)

New route wired into `src/server/routes/index.js` + dispatcher in
`src/core/index.js` (POST branch):

- `POST /api/auth/signup/email` — body `{ name, email, password }`
  1. Validate email/password strength
  2. `getUserByEmail` → if exists return `409 USER_EXISTS` (configurable:
     `allowDuplicateEmails`)
  3. Hash password → `createUser({ ...profile, passwordHash })`
  4. Auto-create session (set `session-token` cookie) — matches Better Auth
     behavior; optional via `signup.autoSignIn`
- Client helper `signUpEmail()` in `src/client/index.js` mirroring `signIn()`
  (fetches CSRF, POSTs form/JSON, returns `{ user, session }` or error)
- New tests: unit for hashing/validation; integration for duplicate-email,
  weak-password, auto-signin cookie assertion

---

## Phase 2 — ✅ DONE — Phone OTP sign-up/sign-in (primary flow)

Follows the Email provider pattern (`src/providers/email.js` +
`src/server/signin/email.js` + callback verification) but SMS-shaped:

1. **Provider**: new `src/providers/phone.js` — `{ id: 'phone', type: 'phone', sendOtp, expiresIn: 300 }`
2. **SMS transport abstraction** (like nodemailer for email): option
   `sms: { send: ({ to, code }) => Promise }` — user-supplied gateway
   (Twilio etc.), no vendor lock-in
3. **Routes** (dispatcher additions in `src/core/index.js`, CSRF-gated like signin):
   - `POST /api/auth/phone/send` — normalize E.164, throttle per-number +
     per-IP (in-memory LRU + pluggable store), generate 6-digit OTP, hash+store
     with expiry/attempts
   - `POST /api/auth/phone/verify` — check hash/expiry/attempts; on success:
     find-or-create user by phone (`phoneVerified=true`), create session, set cookie
4. **Storage**: reuse adapter pattern — add
   `createPhoneVerificationToken / getPhoneVerificationToken /
   deletePhoneVerificationToken` to all three adapters (or a generic
   `verification-token` model replacing per-type methods)
5. **Client**: `signIn('phone', { phone })` + `verifyOtp({ phone, code })`
   helpers in `src/client/index.js`

**Risks:** SMS cost abuse → rate limits mandatory before release;
number-change edge cases documented.

---

## Phase 3 — ✅ DONE — Drizzle adapter

Mirror structure of `src/adapters/prisma/index.js`:

- New `src/adapters/drizzle/index.js` implementing the same `getAdapter()`
  interface; accept either a Drizzle instance or `{ db, schema }`
- Schema definitions exported for users to copy:
  `src/adapters/drizzle/schema.js` (users/sessions/accounts/verification tokens
  incl. new `passwordHash`/`phone` columns)
- Register in `src/adapters/index.js` and root re-export `adapters.js`
- `drizzle-orm` as peerOptionalDependency (like `pg`, `mysql`); dev dep for tests only
- Integration test gated on env var, following `tests/fauna.js` pattern

---

## Phase 4 — ✅ DONE — Password management (follow-up: revoke other sessions on change)

| Capability | Design |
|---|---|
| `changePassword` | `POST /api/auth/change-password` — requires valid session; verify current hash, write new, optional `revokeOtherSessions: true` (delete other sessions via adapter). Client helper. |
| `requestPasswordReset` | Reuse verification-request model: token = randomBytes(32), hashed at rest (same as `src/server/signin/email.js`), emailed via existing Email provider transport |
| `resetPassword(token, newPassword)` | `POST /api/auth/reset-password` — verify token hash + expiry, single-use (delete on success), overwrite hash, invalidate sessions |

---

## Phase 5 — ✅ DONE — Compat facade layer

1. **Session shape**: add `compat: { betterAuth: true }` option; when set,
   `routes/session.js` returns `{ user, session: { expires, accessToken? } }`.
   Default stays v3-shape for backward compat. Also export
   `auth.api.getSession({ headers })` server-side helper doing the same mapping.
2. **`useSession()`**: export new hook returning `{ data, isPending, error,
   refetch }` alongside deprecated tuple `useSession`. Ship codemod script
   `tools/codemod-use-session.js` for the consumer client files; remove tuple
   in 2.0.
3. **Cookie constant**: export `SESSION_COOKIE_NAMES` (incl. better-auth alias
   map) from package root; document drop-in override:
   ```js
   cookies: { sessionToken: { name: '__Secure-better-auth.session_token' } }
   ```
   so `proxy.ts` middleware can read one canonical constant instead of hardcoding.

---

## Phase 6 — ✅ DONE (docs + unit/integration gate; DB docker matrix & release publish pending)

- Docs: README sections per feature; migration guide for `useSession`
- Full gate: `npm run lint && npm run build && npm test` (unit + integration
  across DB docker matrix)
- Versioning suggestion: ship Phases 0–4 + 3 in `1.1.0` (additive); Phase 5's
  `useSession` switch flagged for `2.0.0`

**Suggested order of execution:** 0 → 1 → 5.3 (trivial, do early) → 2 → 3 ∥ 4 → 5.1–5.2 → 6.

---

## TypeORM adapter migration + DB matrix (2026-08-22)

- Migrated `src/adapters/typeorm/index.js` to the typeorm 1.x `DataSource`
  API (the legacy `createConnection`/`getConnection` used by the adapter were
  removed in the declared dependency `typeorm@^1.1.0`). Connections are now
  tracked in a module-level registry keyed by connection name; connection
  failures are logged AND rethrown (previously swallowed, causing a cryptic
  null deref later).
- Fixed MongoDB schema sync: typeorm's MongoSchemaBuilder sends
  `background: null` / `sparse: null` for schema-defined indexes (upstream
  EntitySchemaTransformer drops those options), which MongoDB 4.2+ rejects.
  The adapter patches the mongo query runner to strip null/undefined index
  options at a single choke point.
- Restored unencrypted default for parsed mssql URLs (`options.encrypt =
  false`) matching historical behavior; newer tedious defaults to TLS and
  rejects self-signed certs. Users can pass an explicit config object for TLS.
- Test infra fixes: pinned `mysql:8.0` (removed flag in MySQL 9), switched
  bitnami/mongodb -> bitnamilegacy/mongodb:6.0 with required root password,
  restored exec bits on mssql setup scripts, `tests/mssql.js` now passes a
  config object (mssql >= 12 dropped `mssql://` string parsing).
- Added dev dep `mysql2` (typeorm 1.x driver requirement).
- **Full DB matrix verified against live containers: MySQL, Postgres,
  MongoDB, MSSQL, Fauna — all schema checks pass** including the new
  `passwordHash` / `phone` / `phoneVerified` columns.

## Completion notes (2026-08-21)

- All phases implemented. Verification: `npm run lint` clean, `npm run build`
  succeeds, **82 unit tests passing** (incl. real-SQLite Drizzle adapter tests,
  mocked route-flow tests, codemod tests).
- Live smoke test against the dockerized example app confirmed CSRF gating and
  JSON error responses over HTTP.
- Browser integration tests (puppeteer OAuth flows) require Chrome system libs
  + real provider credentials — not runnable in this environment.
- Known follow-ups:
  - `changePassword` does not revoke other sessions yet (needs a
    `deleteOtherSessions(userId, keepToken)` adapter method across adapters).
  - Tuple `useSession` removal is slated for 2.0; `useAuthSession()` +
    `tools/codemod-use-session.js` shipped for migration.
  - Fauna phone lookup requires the documented `user_by_phone` index.
