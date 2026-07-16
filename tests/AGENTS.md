# Browser Tests

## Purpose

Production-build Playwright coverage for consumer-facing generation routes.

## Ownership

- `e2e/audio.spec.ts` - authenticated audio submission, progress, completed
  playback/download, browser errors, and mobile overflow.

## Local Contracts

- Browser tests never call live Core, spend credits, or require real wallet or
  Google credentials.
- Mocked API responses must preserve the real Go and Core response shapes.
- Fail on uncaught page errors and unexpected console errors.

## Verification

- `npm run test:e2e`

## Child DOX Index

None.
