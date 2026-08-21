# Tests

This project uses [Mocha](https://mochajs.org/) for all automated tests. Tests are split into three layers:

## Unit tests (`tests/unit`)

Fast, isolated tests for pure functions and factories. They run against the compiled `dist/` output, so a build is required first.

```bash
npm run build
npm run test:unit
```

Conventions:
- Files live in `tests/unit/` and are named `*.test.js`.
- They `require('../../dist/...')` (the same build artifact the integration tests use).

## Integration tests (`tests/integration`)

End-to-end tests that drive the example app in `example/` with a headless browser (Puppeteer). They require:
1. The library built (`npm run build`).
2. The example app running in Docker (`tests/docker/app.yml`).
3. At least one database container running (see Database tests below).

```bash
npm test                 # build + unit + integration + teardown
npm run test:app:start   # start only the app container
npm run test:app:stop    # stop the app container
```

## Database tests (`tests/db`)

Smoke tests that verify each adapter can connect and round-trip data against a real database.

```bash
npm run db:start         # start all database containers
npm run test:db          # run mysql, postgres, mongodb, mssql, fauna checks
npm run db:stop          # stop all database containers

# or individually:
npm run test:db:postgres
npm run test:db:mysql
npm run test:db:mongodb
npm run test:db:mssql
npm run test:db:fauna
```

## Full suite

`npm test` runs `build → test:unit → test:integration → teardown` and relies on Docker being available with the required images pulled.

## Headless browser (Puppeteer) prerequisites

The integration tests launch a real browser via Puppeteer. On Linux the
downloaded Chromium needs system libraries that are not present by default.
Install them before running `npm test`:

```bash
sudo apt-get update && sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 libatspi2.0-0
```

The CI workflow (`.github/workflows/integration.yml`) installs these
automatically. The OAuth flows themselves additionally require provider
credentials (`ISCAUTH_GITHUB_*` / `ISCAUTH_TWITTER_*`) and a real test
account; without them the browser tests cannot complete the login step.
