# lib — frontend client logic (API, web3, stores, hooks)

## Purpose

The browser-side application logic between `app/` pages and the backends: the typed API client,
wallet/web3 integration, auth/session handling, Zustand stores, and React hooks.

## Ownership

- `api.ts` owns the single typed client for the Go API, including image/video job
  submission, the separate durable-video broker, and the canonical Core-backed credit quote. Sends the session cookie via
  `credentials: 'include'` (no `Authorization` header). Surfaces `status: message` errors.
- `auth.ts` — wallet sign-in (calls the Go `/api/auth/wallet/*` Core broker), session helpers, and the
  non-sensitive session markers (address + canonical account ID + expiry). Exposes `signIn`, awaited `signOut` (→ Go
  `/auth/logout`), `fetchSession` (→ Go `/auth/me`), `isAuthenticated`, `getApiBase`.
- `google-identity.ts` owns the page-wide Google Identity Services singleton,
  posts credentials to `/auth/google`, and dispatches the result to mounted auth
  surfaces. GSI must be initialized exactly once per page; buttons and One Tap
  subscribe to the shared callback instead of replacing it.
- `nonce-store.ts` — in-memory one-time nonce store used by the `/auth-api` routes
  (`storeNonce` / `consumeNonce` / `cleanupNonces`). Replace with Redis if multi-instance.
- `wagmi.ts` — wagmi/RainbowKit config. `web3/` — wallet hooks/types. `supabase.ts` — Supabase
  client. Core's `/account/credits` and `/account/credits/quote` responses are
  the only balance and price authorities.
- `stores/` — Zustand stores (`auth-store.ts` supports wallet + Google;
  `job-store.ts` partitions persisted jobs by canonical Core account and owns
  pre-submission recovery handles for Studio and Director).
- `create/` — pure Studio helpers. `capabilities.ts` (`getModelCapabilities`) maps a model's
  declared `type`/`limits`/flags to the control groups the create rail renders — the single place
  that decides which Advanced knobs a model exposes (keep new per-model UI gating here, not in JSX).
- `hooks/` — data + UI hooks. `storage.ts`, `utils/` (`download.ts`, `thumbnails.ts`),
  `types/create.ts`.

## Local Contracts

- **`api.ts` is the only place that calls the Go API.** Components/hooks go through it.
- **The JWT is never in JS.** It lives only in the httpOnly cookie set by `/auth-api/verify`
  (wallet) or the Go `/auth/google` (Google). `auth.ts` / `auth-store.ts` store only
  non-sensitive markers (wallet address, canonical account ID, Google profile) for UI. Never store a token in
  `localStorage`. `getActiveAuthToken` / token getters must not return.
- Generation requires an authenticated Google or wallet session. The Go server independently caps batch size,
  dimensions, steps, audio duration, prompt/lyrics length, and seed. Never treat a client-side limit as a security boundary.
- `useStylesConfig` overlays Core-backed `/models` generation modes onto the
  presentation catalog. Capability fetch failure falls back to catalog metadata,
  while Core still rejects unsupported source images server-side.
- Studio sampling settings are model-scoped. Native batch requests are limited
  to the explicit online image-model allowlist in `supportsImageBatch` until
  recipe metadata can advertise a verified batch strategy. Source-image and
  video submissions remain single-output. Unknown/offline models fail closed.
  New image submissions and saved metadata honor an explicit model scheduler
  before the global fallback. Model dimension bands reject unsupported sizes
  before saving/submitting a request, never silently resize a paid job.
  `supportsLora:false` hides/rejects adapters for workflows such as MOSS with
  no qualified injection path; omission preserves existing model behavior.
- Wallet sign-in (`auth.ts`) must sign Core's returned SIWE message unchanged.
  The Go broker derives the app subject and Core rejects reused,
  stale, cross-service, cross-subject, or foreign-origin challenges.
- Wallet sign-in/link functions run only after an explicit user action. Wagmi
  rehydration and wallet connection are never authentication intent.
- Google credential dispatch uses `/auth/google` while signed out and protected
  `/auth/link-google` for a wallet-authenticated session; the latter preserves
  proof of both identities while Core merges their canonical accounts.
- `auth-store.syncFromServer()` (`/auth/me`) is the authoritative auth check; `syncFromStorage()`
  is optimistic UI only. Do not trigger wallet signing, redirect protected pages,
  or show Google One Tap until the first server check completes.
- New local jobs use `accountId`, never a wallet address or Google subject. When
  an existing browser first receives an account ID, migrate only persisted jobs
  matching the currently proved login aliases; never relabel another user's jobs.
- Studio `hooks/use-creations` takes the canonical account ID, not a login boolean.
  Every local completion/progress path is owner-filtered. Account changes hide
  the previous view immediately and discard its late history responses. Signed-out
  Studio does not import unscoped browser history; recovery records remain intact.
  Late submission/removal callbacks also check the currently active owner, not
  only the owner captured when an asynchronous action started.
- Logout is server-authoritative: await `/auth/logout` before clearing local
  profile markers, and retain the signed-in UI if cookie invalidation fails.
- Keep request/response types aligned with `types/models.ts` and the Go structs.
- Preserve Core's `grid.job_id` as `gridJobId` through job polling, Gallery
  persistence, local creation state, and generation details.
- Studio generation/regeneration and each Director stage call
  `job-store.submitJob`, not `api.createJob` directly. It verifies a small
  owner-scoped `requestId` record reached localStorage before POST, then hands
  the accepted Gallery job ID to ordinary polling. Storage failure dispatches
  nothing. Unresolved records contain display metadata, not request bodies,
  uploaded source images, audio, or timeline data; at most 20 may be unresolved.
  Another submission with the same owner/model/prompt waits while an earlier
  request is unresolved, even if other settings changed; it is not silently
  treated as a new paid retry.
- After a lost response/reload, the store reads
  `/jobs/requests/{requestID}` only under the currently authenticated owner.
  It never repeats the generation POST. It creates a private history placeholder
  before handing recovered work to ordinary polling. Definite synchronous
  admission rejections discard the request handle; transport, gateway, missing,
  ambiguous and malformed responses preserve it. Recovery errors back off for
  30 seconds, and neither those nor repeated status failures mean a refund.
- A `DurableVideoSubmission` uses that same handle/polling lifecycle but calls
  `POST /videos/jobs` once, never the legacy timeline route or model fallback.
  A positive safe-integer ceiling is required before saving the handle. Only
  Gallery's 32-character lowercase hexadecimal job ID plus queued status hands
  it off to job polling. This is not the request's UUIDv4 or Core's receipt UUID;
  malformed success, reply loss and gateway errors retain request recovery.
  Opening/timed images and reference audio/video remain ephemeral request data,
  never copied into the pending-request journal. Recheck the active account
  after the preparation callback and before dispatch. Core and Go remain the
  source-validation, admission and billing authorities. The typed Distilled
  client preserves separate BF16/NVFP4 names; the common Generate workspace
  gates submission, not visibility, through authenticated server capabilities.
- `create/durable-video-resolutions.ts` owns the six bounded UI presets
  and orientation-preserving source-mode alignment. Presets do not alter
  server geometry limits, model admission or per-second tariffs.
- `create/durable-director-payload.ts` prepares an explicit 8n+1 output count,
  using `create/durable-video-limits.ts` for the BF16625-frame candidate ceiling
  and unchanged NVFP4337-frame ceiling. Quote and payload validation share the
  same per-model limit; changing models invalidates incompatible long quotes,
  never silently shortens a request. Completed625-frame clips remain immutable
  when imported for assembly. These bounds need native/release qualification.
  It prepares the
  quote ceiling, geometry, seed and optional ordered image guides. It never
  rounds a legacy segment duration or inserts its stored portrait implicitly.
  Reference sound must be prepared stereo48k exact-duration WAV; motion also
  needs prepared MP4 and64-aligned geometry. Motion permits only an explicit
  frame-zero pin. This helper checks shape, not actual media decode/fidelity;
  Core remains authoritative. It never processes old timeline audio slices.
- `hooks/use-durable-video-quote.ts` uses `/videos/quote`, not the legacy
  seconds-based quote. It requires enabled/authenticated owner state and binds
  account/model/frames/fps/live price before exposing a ceiling. A changed
  owner or frame count hides stale data immediately; cleanup cancels pending
  responses. Refresh is quote-only; terminal clip observation refreshes the
  balance/ceiling without generating. Actual audio preparation and native
  funded acceptance remain rollout gates.
- `hooks/use-durable-video-capabilities.ts` reads only the authenticated,
  no-store pilot capability endpoint. It validates exact model names, distinct
  rows and positive safe worker counts; malformed/foreign-account late replies
  cannot enable controls. Capacity is not model-fidelity proof. The Director
  workspace consumes the gate; native paid acceptance still gates activation.
- `hooks/use-durable-director-clip.ts` owns the common Text/Audio/Video form.
  PNG, JPEG and Studio-generated WebP opening images up to 10 MB
  remain ephemeral and never enter persisted request/job metadata. Browser
  MIME/size checks are UX; Core still decodes and validates the actual bytes.
  Busy/unknown jobs lock fresh submissions, a synchronous in-flight guard
  prevents double-click POSTs, and library-write failure never retries paid
  generation. Canonical owner changes reset the mounted form and prevent late
  callbacks from dispatching or altering the next account's form. Legacy
  timeline data is never implicitly migrated. Audio/video modes call the
  authenticated preparation endpoint before saving a generation intent; the
  returned exact frames/geometry/source start must match. An owner change,
  cancellation, closed source mode or failed preparation dispatches nothing.
  Sources may be up to512MiB. `api.prepareVideoSource` preserves the <=64MiB
  multipart route and uses owner-bound sequential8MiB chunks above it, with
  progress and independent bounded DELETE cleanup after abort/error. Validate
  ticket identity/size/chunk size and every acknowledged offset; no upload or
  generation retry. Settings are frozen by the server at ticket creation.
  BF16 uploaded-source output permits625frames, matching generated BF16.
  Core requires the separate long-source worker capability above337frames;
  native audio/motion and funded qualification precede release. Larger files
  do not extend duration beyond625frames. NVFP4 sources remain closed.
  File objects, object URLs and normalized source bodies stay in memory only;
  revoke preview URLs on replacement/unmount. V2V fits 64-aligned geometry and
  retains explicit prepared sound; appearance-only references stay disabled.
  A successful queued/processing/terminal poll for the exact saved request clears
  only its stale unknown-submit notice. Uncertain results, failed polls and
  unrelated requests must not clear it or enable a second submission.
  Edit / Assemble disables all legacy render
  entry points. Imported finished clips remain completed, immutable-length
  output references and cannot become paid render requests.
- Pending requests and active jobs do not expire under the 24-hour completed
  history cleanup. The Jobs menu displays unresolved requests. Director retains
  separate `startImageRequestId` and video `requestId`; a recovered ID can only
  attach to its corresponding stage/account. Uploading/replacing a frame or
  selecting a definite-failure fallback clears that stage's old association.
  `/auth/me` returns Core-proven account aliases. The auth store holds those in
  memory only and clears them on identity changes/logout; they may migrate
  local job and unresolved-request ownership without dropping either handle
  when IDs collide. The backend remains the authority and returns 409 for
  ambiguous requests. Live account-merge verification remains a rollout gate.
  A 5xx session check preserves the last session instead of treating a Core
  outage as logout; only 401/403 clears authentication markers.
- **Director wire contract** (`create/director-payload.ts` → `hooks/use-director.ts`): each
  timeline SEGMENT renders as its own job against the `LTX Director 2.0` recipe — image keyframe
  at frame 0 + one prompt + optional audio slice, all inside one `timelineData` string (media
  rides inline as base64). Per-job cap is the recipe's 8s clamp; the timeline total is unbounded
  (chaining = N jobs). `segment_lengths` is **frames at 24fps** (verified live — the API guide's
  "seconds" comment is wrong) and must pair 1:1 with `local_prompts`; `normalDurationFrames` is
  `frames+1`; the timeline's `global_prompt` stays empty (top-level `prompt` wins); audio
  segments need a truthy `audioFile` or the node inpaints over the upload, and `trimStart`
  (frames) windows each segment's slice of the shared track; timeline ≤ ~24MB client-side.
  A segment's own first frame may be uploaded or generated as a separate private `Krea 2 Turbo`
  image job. The shared job store polls it; `useDirectorSync` fetches the finished CDN image
  through `/api/download`, crops it to the Director geometry, and stores it inline. Never reuse
  the image job id as the segment's video `jobId`. Credit displays and estimates come only
  from Core's `/credits` and `/credits/quote`; completed first-frame and segment receipts
  come only from the server-observed polling result.
- Director reload recovery must not turn untracked queued/rendering segments
  into idle work or infer completion from an older output. Preserve job/receipt
  IDs, mark the result uncertain, and keep it out of Render pending. Missing
  browser tracking is not a Core cancellation or refund; an explicit retry is
  a new potentially chargeable job. New request handles support read-only
  recovery with Gallery migration 0003 and Core migration 0040/result API;
  older submissions without those handles cannot be reconstructed on the client.

## Work Guidance

- New API call → add a typed function in `api.ts`; surface via a hook and a store if shared.

## Verification

- `npm run test` (Jest) — covers `hooks/` and `utils/`. `npx tsc --noEmit`.

## Child DOX Index

- None — leaf.
