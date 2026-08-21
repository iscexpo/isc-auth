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
