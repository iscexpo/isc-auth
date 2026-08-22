# isc-auth

Authentication for Next.js.

`isc-auth` is a flexible authentication library for Next.js applications. It supports both the **Pages Router** and the **App Router**, a wide range of OAuth providers, email magic links, and credential-based sign in. Sessions can be stored in a database or as stateless JSON Web Tokens (JWTs).

## Features

- **Next.js first-class support** — works with the Pages Router (`pages/api/auth`) and the App Router (`app/api/auth/[...iscauth]/route.js`).
- **Many providers out of the box** — GitHub, Google, Twitter, Facebook, GitLab, Discord, Apple, and many more, plus `Credentials`, `Email`, and `Phone` providers.
- **Email + password registration** — built-in sign-up API endpoint (`signUpEmail`).
- **Phone number sign in** — SMS one-time-code sign up / sign in via the `Phone` provider.
- **Password management** — change password, request password reset emails, and reset passwords.
- **Flexible sessions** — use database-backed sessions or encrypted/signed JWT sessions (default when no database is configured).
- **Pluggable databases** — TypeORM, Prisma, Fauna, and Drizzle adapters (MySQL, PostgreSQL, MongoDB, MSSQL, SQLite, etc.).
- **Customizable** — override the built-in pages, and hook into `callbacks` and `events` for full control.
- **Better Auth compatibility** — opt-in response shapes, a programmatic `auth.api`, and matching session cookie names make migrating from Better Auth straightforward.

## Installation

```sh
npm install isc-auth
```

`isc-auth` lists `react` and `react-dom` as peer dependencies, so make sure they are installed in your project.

## Quick start

### 1. Configure the API route

Create a catch-all API route and initialize `isc-auth` with your providers.

**Pages Router** — `pages/api/auth/[...iscauth].js`:

```js
import ISCAuth from "isc-auth"
import Providers from "isc-auth/providers"

export default ISCAuth({
  providers: [
    Providers.GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  session: {
    jwt: true,
  },
  jwt: {
    secret: process.env.SECRET,
  },
})
```

**App Router** — `app/api/auth/[...iscauth]/route.js`:

```js
import ISCAuthApp from "isc-auth/app"
import Providers from "isc-auth/providers"

const handler = ISCAuthApp({
  providers: [
    Providers.GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
})

export const GET = handler
export const POST = handler
```

### 2. Set up environment variables

Copy `.env.example` to `.env.local` and fill in your provider credentials, plus a long random `SECRET` and the public URL of your app:

```sh
ISCAUTH_URL=http://localhost:3000
GITHUB_ID=
GITHUB_SECRET=
SECRET=
```

> The `ISCAUTH_URL` environment variable must be set for OAuth redirects to work correctly in production.

### 3. Wrap your app (optional but recommended)

In `pages/_app.js`, use the `Provider` so that `useSession()` works anywhere in your client components:

```js
import { Provider } from "isc-auth/client"

export default function App({ Component, pageProps }) {
  return (
    <Provider session={pageProps.session}>
      <Component {...pageProps} />
    </Provider>
  )
}
```

### 4. Use the session

On the client:

```js
import { useSession, signIn, signOut } from "isc-auth/client"

const [session, loading] = useSession()
```

On the server / in an API route:

```js
import { getSession } from "isc-auth/client"

const session = await getSession({ req })
```

## Configuration

`isc-auth` accepts a single options object. The most common options are:

| Option           | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `providers`      | Array of configured providers (see `isc-auth/providers`).                  |
| `database`       | A database connection URI or config object (enables DB-backed sessions).    |
| `adapter`        | An adapter instance for advanced database usage.                            |
| `session`        | Session options (`jwt`, `maxAge`, `updateAge`).                             |
| `jwt`            | JWT options (`secret`, `encryption`, custom `encode`/`decode`).            |
| `signup`         | Email + password registration options (`minPasswordLength`, `autoSignIn`).  |
| `otp`            | Phone OTP options (`rateLimits`, custom in-memory `store`).                 |
| `forgotPassword` | Password reset delivery: `sendResetRequest({ identifier, url, token, provider })`, plus rate limit and token lifetime settings. |
| `compat`         | Compatibility switches, e.g. `compat: { betterAuth: true }`.                |
| `pages`          | Override the built-in sign-in, sign-out, error, and verify-request pages.   |
| `callbacks`      | `signIn`, `redirect`, `session`, and `jwt` callbacks.                       |
| `events`         | `signIn`, `signOut`, `createUser`, etc. for logging/side effects.          |
| `debug`          | Enable verbose console logging.                                             |

## Available providers

`isc-auth/providers` exports `Credentials`, `Email`, `Phone`, and a large set of OAuth providers including: Apple, Atlassian, Auth0, Azure AD B2C, Basecamp, Battle.net, Box, Bungie, Cognito, Discord, Facebook, Foursquare, FusionAuth, GitHub, GitLab, Google, IdentityServer4, LinkedIn, MailRu, Mixer, Netlify, Okta, Reddit, Slack, Spotify, Strava, Twitch, Twitter, VK, and Yandex.

## Email + password registration

With an adapter configured, users can register with a name, email, and password (hashed with scrypt). The endpoint requires no adapter-specific setup:

```js
import { signUpEmail } from "isc-auth/client"

const { user, error } = await signUpEmail({
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery-staple",
})
```

Configure policy via the `signup` option:

```js
ISCAuth({
  providers,
  signup: {
    minPasswordLength: 10, // default 8
    autoSignIn: true,      // default true - sets the session cookie on success
  },
})
```

Errors are returned as structured codes instead of throwing: `USER_EXISTS`, `WEAK_PASSWORD`, `INVALID_EMAIL`.

## Phone number sign in (SMS OTP)

Add the `Phone` provider to enable one-time-code sign up / sign in over SMS:

```js
import Providers from "isc-auth/providers"

ISCAuth({
  providers: [
    Providers.Phone({
      async sendVerificationRequest({ identifier: phone, token, provider }) {
        await mySmsClient.send(phone, `Your code is ${token}`)
      },
    }),
  ],
  otp: {
    rateLimits: {
      sendPerPhonePerHour: 3,   // default
      resendCooldownSeconds: 60, // default
      verifyAttempts: 5,         // default
    },
  },
})
```

On the client:

```js
import { sendPhoneOtp, verifyPhoneOtp } from "isc-auth/client"

await sendPhoneOtp({ phone: "+15551234567" })        // triggers sendVerificationRequest
const { user, error } = await verifyPhoneOtp({ phone: "+15551234567", code: "123456" })
```

The first verification creates the user account automatically; subsequent verifications sign the existing user in.

## Password management

Signed-in users can change their password, and password resets work over email-style tokens:

```js
import { changePassword, forgotPassword, resetPassword } from "isc-auth/client"

// signed-in user changes their own password
const { ok, error } = await changePassword({ currentPassword: "...", newPassword: "..." })

// request a reset link/token (always resolves ok - never reveals if the account exists)
await forgotPassword({ email: "ada@example.com" })

// consume the token from the email
const result = await resetPassword({ email: "ada@example.com", token, password: "new-password" })
```

Delivery of reset tokens is your responsibility, via the `forgotPassword.sendResetRequest` callback:

```js
ISCAuth({
  providers,
  forgotPassword: {
    async sendResetRequest({ identifier: email, url, token, provider }) {
      await myEmailClient.send(email, `Reset your password: ${url}`)
    },
    tokenMaxAgeSeconds: 3600,
  },
})
```

Reset tokens are single use, stored hashed, and expire after `tokenMaxAgeSeconds` (default 1 hour).

## Better Auth compatibility

For codebases migrating from Better Auth, `isc-auth` supports drop-in style conventions:

- **Session response shape** — set `compat: { betterAuth: true }` and `/api/auth/session` returns `{ user, session: { expires } }` instead of the flat v3 shape `{ user, expires }`. Signed-out requests return `null`.
- **Programmatic API** — the configured handler exposes `auth.api.getSession({ headers })` for server-side lookups (accepts Web `Headers` instances or plain objects):

  ```js
  // pages/api/auth/[...iscauth].js
  import ISCAuth from "isc-auth"
  export const auth = ISCAuth({ ...options })
  export default auth

  // anywhere on the server:
  const session = await auth.api.getSession({ headers }) // null when signed out
  ```

- **Cookie names** — import canonical names instead of hardcoding strings:

  ```js
  import { getSessionCookieNames, BETTER_AUTH_COOKIE_ALIASES } from "isc-auth/server"
  ```

## Migrating `useSession()` to `useAuthSession()`

The classic tuple hook is deprecated:

```js
// before (deprecated)
const [session, loading] = useSession()

// after
const { data: session, isPending: loading, error, refetch } = useAuthSession()
```

Run the bundled codemod to update your source files in place (variable names are preserved as aliases):

```sh
node node_modules/isc-auth/tools/codemod-use-session.js src/
```

The tuple form keeps working today and will be removed in 2.0.

## Development

```sh
npm run build   # build JS + CSS into dist/
npm run watch   # rebuild on change
npm test        # unit + integration tests (uses Docker)
```

The `example/` directory contains a working Next.js demo app that exercises `isc-auth`.

## Database / adapters

Adapters are available for **TypeORM** (default), **Prisma**, **Fauna**, and **Drizzle**. Database support includes MySQL, MariaDB, PostgreSQL, MongoDB, MSSQL, and SQLite (depending on the chosen adapter). The `Email` provider requires a database; OAuth and Credentials providers do not.

Using Drizzle:

```js
import Adapters from "isc-auth/adapters"
import * as schema from "./drizzle-schema" // see dist/adapters/drizzle/schema.js

ISCAuth({
  adapter: Adapters.Drizzle({ db, tables: { users: schema.users, ... } }),
})
```

Users created by the new features use three optional columns: `passwordHash`, `phone`, and `phoneVerified`. Add them to your existing schema to enable email + password registration and phone sign in.

## License

ISC
