# lib — frontend client logic (API, web3, stores, hooks)

## Purpose

The browser-side application logic between `app/` pages and the backends: the typed API client,
wallet/web3 integration, auth/session handling, Zustand stores, and React hooks.

## Ownership

- `api.ts` — the single typed client for the Go API, including image/video job
  submission and the canonical Core-backed credit quote. Sends the session cookie via
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
  `job-store.ts` partitions and migrates persisted jobs by canonical Core account).
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
  to text-to-image until recipe metadata can advertise a verified batch strategy;
  source-image and video submissions must remain single-output meanwhile.
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
- Logout is server-authoritative: await `/auth/logout` before clearing local
  profile markers, and retain the signed-in UI if cookie invalidation fails.
- Keep request/response types aligned with `types/models.ts` and the Go structs.
- Preserve Core's `grid.job_id` as `gridJobId` through job polling, Gallery
  persistence, local creation state, and generation details.
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

## Work Guidance

- New API call → add a typed function in `api.ts`; surface via a hook and a store if shared.

## Verification

- `npm run test` (Jest) — covers `hooks/` and `utils/`. `npx tsc --noEmit`.

## Child DOX Index

- None — leaf.
