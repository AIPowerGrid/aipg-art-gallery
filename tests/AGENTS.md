# Browser Tests

## Purpose

Production-build Playwright coverage for consumer-facing generation routes.

## Ownership

- `e2e/director.spec.ts` - legacy project preservation in Edit / Assemble,
  no paid timeline submission, assembly-first navigation/shared site header and
  mobile assembly overflow. Old render-hook contracts remain separately unit tested;
  this browser workspace must not expose an unqualified render action.
- `e2e/navigation.spec.ts` - top-level Director discovery, stable account/auth
  controls across reload, responsive navigation, and the retired
  `aipg.art/audio` route contract.
- `e2e/durable-director.spec.ts` - server-gated clip selection, exact-frame
  quote/ceiling, one paid-intent POST, explicit opening-image privacy, lost
  reply/reload with admission closed, account isolation, credit rejection,
  desktop/mobile overflow and real H.264 fixture decoding/seeking. Synthetic
  playback and mocked billing are not a native worker/debit/refund proof.
  Acceptance fixtures use Gallery's real 32-character hex IDs, separately from
  Core/request UUIDs. Normal processing must not display an unknown-outcome or
  recovery warning; lost replies must retain same-request, GET-only recovery.
  A confirmed processing result clears the stale submission warning before
  completion. Explicit video seeds and inset dropdown-arrow/text padding are
  checked alongside phone/tablet/desktop bounds; no live GPU requests occur.
  `fixtures/clip-81-frames.mp4` is a generated diagnostic pattern, not user media.
  Studio's URL selects Video; the opening-image fixture
  decodes WebP like Studio output while preserving request-journal privacy.
  Image/video drafts survive mode switching independently, stale catalog video
  models stay hidden, and 390/768/1024/1440 layouts retain the site shell without
  overflow. Signed-out visitors see the same Video entry and all three modes. Source
  preparation fixtures prove one ephemeral upload/POST and no stored media;
  real codec/sandbox tests live in the backend, not mocked browser responses.
  Resolution coverage exercises six presets at390/768/1280 widths, preserves
  portrait geometry across source modes and binds the selected size to one POST.
  These browser fixtures do not prove native render capacity.
  Longer BF16 coverage selects625 frames, binds the rounded520834-micro quote
  to one POST and checks desktop/mobile overflow. It is not native26-second
  GPU execution or a real debit. Source preparation has independent real-codec
  625-frame window/short-input/cleanup tests in the Go suite.
  Audio/video source browser cases independently select625frames, prepare
  once, bind the same exact ceiling and submit once at desktop/mobile sizes.
  Inputs remain ephemeral. These mocked cases do not qualify native sources.
  A65MiB browser source fixture additionally verifies nine ordered8MiB-or-less
  requests, one preparation and one generation intent, with no original or
  ticket in local storage. Real larger audio/video normalization, fixed/idle
  expiry, ownership and concurrent-byte integrity live in the Go race suite;
  this fixture is not live R2/GPU or purchased-source acceptance.
  Scene-first cases at390/1280pixels compose exactly one private capped image,
  expose the reference upload without expanding a disclosure (also signed out),
  render the actual cropped raster, require a separate opening-frame selection,
  then send one explicit audio-driven video request. Neither image completion
  nor selection animates. Reload exposes completed owner-bound images as manual
  choices without reusing uploads or generating. Raster/audio request bodies
  never enter local storage. Scene requests select MOSS Image SFT BF16 with
  50steps/CFG3/Euler/simple. These fixtures do not qualify MOSS identity
  editing or actual paid settlement. Dedicated API tests reject legacy fallback;
  real handler/transport tests cover ceiling drift and missing Core support.
  Node-environment download tests cover protocol/host/MIME/redirect/size controls;
  shared Jest setup touches `window` only in browser environments.
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
  MOSS cases read the actual curated model config at1280/390pixels, disable
  out-of-band dimensions and unqualified LoRA/batch controls, and bind source
  pixels plus50steps/CFG3/Euler/simple to one mocked submission. Screenshots
  and full image decoding prove client rendering only, not paid GPU execution.
  Focus-preview raster fixtures check portrait, landscape, square and small
  outputs at desktop/mobile widths, including mismatched request dimensions.
  Assert intrinsic proportions, no upscaling, compact left-aligned size, original-image
  loading and modal access without a live generation or credit spend.

## Local Contracts

- Browser tests never call live Core, spend credits, or require real wallet or
  Google credentials.
- Mocked API responses must preserve the real Go and Core response shapes.
- Fail on uncaught page errors and unexpected console errors.
- Clip fixtures stub WalletConnect's exact telemetry batch endpoint because
  their project ID is synthetic, including query-bearing requests. The larger
  upload case explicitly proves that match; application HTTP errors remain failures.
- Console diagnostics retain resource origins/paths, not query strings. Failed
  synthetic browser runs retain traces for seven days in CI; never run that
  artifact upload against authenticated production sessions.

## Verification

- `npm run test:e2e`
- `GALLERY_E2E_PORT` selects a free local port (default 3002); use `CI=1` to
  require a fresh production-build server instead of reusing another checkout.

## Child DOX Index

None.
