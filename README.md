# isc-auth

Authentication for Next.js.

`isc-auth` is a flexible authentication library for Next.js applications. It supports both the **Pages Router** and the **App Router**, a wide range of OAuth providers, email magic links, and credential-based sign in. Sessions can be stored in a database or as stateless JSON Web Tokens (JWTs).

## Features

- **Next.js first-class support** — works with the Pages Router (`pages/api/auth`) and the App Router (`app/api/auth/[...iscauth]/route.js`).
- **Many providers out of the box** — GitHub, Google, Twitter, Facebook, GitLab, Discord, Apple, and many more, plus `Credentials` and `Email` providers.
- **Flexible sessions** — use database-backed sessions or encrypted/signed JWT sessions (default when no database is configured).
- **Pluggable databases** — TypeORM, Prisma, and Fauna adapters (MySQL, PostgreSQL, MongoDB, MSSQL, etc.).
- **Customizable** — override the built-in pages, and hook into `callbacks` and `events` for full control.

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

| Option     | Description                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| `providers`| Array of configured providers (see `isc-auth/providers`).                  |
| `database` | A database connection URI or config object (enables DB-backed sessions).    |
| `adapter`  | An adapter instance for advanced database usage.                            |
| `session`  | Session options (`jwt`, `maxAge`, `updateAge`).                             |
| `jwt`      | JWT options (`secret`, `encryption`, custom `encode`/`decode`).            |
| `pages`    | Override the built-in sign-in, sign-out, error, and verify-request pages.   |
| `callbacks`| `signIn`, `redirect`, `session`, and `jwt` callbacks.                       |
| `events`   | `signIn`, `signOut`, `createUser`, etc. for logging/side effects.          |
| `debug`    | Enable verbose console logging.                                             |

## Available providers

`isc-auth/providers` exports `Credentials`, `Email`, and a large set of OAuth providers including: Apple, Atlassian, Auth0, Azure AD B2C, Basecamp, Battle.net, Box, Bungie, Cognito, Discord, Facebook, Foursquare, FusionAuth, GitHub, GitLab, Google, IdentityServer4, LinkedIn, MailRu, Mixer, Netlify, Okta, Reddit, Slack, Spotify, Strava, Twitch, Twitter, VK, and Yandex.

## Development

```sh
npm run build   # build JS + CSS into dist/
npm run watch   # rebuild on change
npm test        # unit + integration tests (uses Docker)
```

The `example/` directory contains a working Next.js demo app that exercises `isc-auth`.

## Database / adapters

Adapters are available for **TypeORM** (default), **Prisma**, and **Fauna**. Database support includes MySQL, MariaDB, PostgreSQL, MongoDB, and MSSQL (depending on the chosen adapter). The `Email` provider requires a database; OAuth and Credentials providers do not.

## License

ISC
