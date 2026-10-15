# Browser Tests

## Purpose

Production-build Playwright coverage for consumer-facing generation routes.

## Ownership

- `e2e/director.spec.ts` - legacy project preservation in Edit / Assemble,
  no paid timeline submission, stable default Generate selection and mobile
  assembly overflow. Old render-hook contracts remain separately unit tested;
  this browser workspace must not expose an unqualified render action.
- `e2e/navigation.spec.ts` - top-level Director discovery, stable account/auth
  controls across reload, responsive navigation, and the retired
  `aipg.art/audio` route contract.
- `e2e/durable-director.spec.ts` - server-gated clip selection, exact-frame
  quote/ceiling, one paid-intent POST, explicit opening-image privacy, lost
  reply/reload with admission closed, account isolation, credit rejection,
  desktop/mobile overflow and real H.264 fixture decoding/seeking. Synthetic
  playback and mocked billing are not a native worker/debit/refund proof.
  `fixtures/clip-81-frames.mp4` is a generated diagnostic pattern, not user media.
  Eligible first visits default to the clip tab; the opening-image fixture
  decodes WebP like Studio output while preserving request-journal privacy.
  Signed-out visitors see the same Generate entry and all three modes. Source
  preparation fixtures prove one ephemeral upload/POST and no stored media;
  real codec/sandbox tests live in the backend, not mocked browser responses.
  Longer BF16 coverage selects721 frames, binds the rounded600834-micro quote
  to one POST and checks desktop/mobile overflow. It is not native30-second
  GPU execution or a real debit. Source preparation has independent real-codec
  721-frame window/short-input/cleanup tests in the Go suite.
- `e2e/studio.spec.ts` - authenticated Studio focus/preview pricing, universal
  account-menu and creation-library navigation, mobile overflow, and a lost POST
  response followed by browser reload/read-only recovery with one generation POST.
  A second case changes the canonical account at reload and recovers using
  server-provided aliases; neither case proves a funded live generation.
  Credit rejection and worker-failure fixtures check prompt retention, funding
  links, balance refresh, reload persistence, account isolation, and no automatic
  paid retry. They do not prove a real Core debit or refund.
  Cached completed history is also checked across canonical account changes
  and reloads; another account's browser receipts must never populate Studio.
  Four-output batch coverage checks one submission, four rendered images,
  desktop/mobile overflow and source-upload batch reset. These mocked browser
  tests complement, but do not replace, real Core/GPU billing canaries.

## Local Contracts

- Browser tests never call live Core, spend credits, or require real wallet or
  Google credentials.
- Mocked API responses must preserve the real Go and Core response shapes.
- Fail on uncaught page errors and unexpected console errors.

## Verification

- `npm run test:e2e`
- `GALLERY_E2E_PORT` selects a free local port (default 3002); use `CI=1` to
  require a fresh production-build server instead of reusing another checkout.

## Child DOX Index

None.
