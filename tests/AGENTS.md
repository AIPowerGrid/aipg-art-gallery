# Browser Tests

## Purpose

Production-build Playwright coverage for consumer-facing generation routes.

## Ownership

- `e2e/director.spec.ts` - authenticated keyframe upload and Director timeline
  submission, including the no-client-wallet-identity request invariant,
  first-render onboarding progression/reload recovery, and mobile workspace
  overflow coverage.
- `e2e/navigation.spec.ts` - top-level Director discovery and the retired
  `aipg.art/audio` route contract.
- `e2e/studio.spec.ts` - authenticated Studio focus/preview pricing, universal
  account creation-library navigation, and mobile overflow coverage.

## Local Contracts

- Browser tests never call live Core, spend credits, or require real wallet or
  Google credentials.
- Mocked API responses must preserve the real Go and Core response shapes.
- Fail on uncaught page errors and unexpected console errors.

## Verification

- `npm run test:e2e`

## Child DOX Index

None.
