# lib — frontend client logic (API, web3, stores, hooks)

## Purpose

The browser-side application logic between `app/` pages and the backends: the typed API client,
wallet/web3 integration, auth/session handling, Zustand stores, and React hooks.

## Ownership

- `api.ts` — the single typed client for the Go API. Sends the session cookie via
  `credentials: 'include'` (no `Authorization` header). Surfaces `status: message` errors.
- `auth.ts` — wallet sign-in (calls the Next `/auth-api/*` routes), session helpers, and the
  non-sensitive session marker (address + expiry). Exposes `signIn`, `signOut` (→ Go
  `/auth/logout`), `fetchSession` (→ Go `/auth/me`), `isAuthenticated`, `getApiBase`.
- `nonce-store.ts` — in-memory one-time nonce store used by the `/auth-api` routes
  (`storeNonce` / `consumeNonce` / `cleanupNonces`). Replace with Redis if multi-instance.
- `wagmi.ts` — wagmi/RainbowKit config. `web3/` — wallet hooks/types. `supabase.ts` — Supabase
  client. `generation-limits.ts` — anon/member generation-limit logic (UX gating only).
- `stores/` — Zustand stores (`auth-store.ts` supports wallet + Google; `job-store.ts`).
- `create/` — pure Studio helpers. `capabilities.ts` (`getModelCapabilities`) maps a model's
  declared `type`/`limits`/flags to the control groups the create rail renders — the single place
  that decides which Advanced knobs a model exposes (keep new per-model UI gating here, not in JSX).
- `hooks/` — data + UI hooks. `storage.ts`, `utils/` (`download.ts`, `thumbnails.ts`),
  `types/create.ts`.

## Local Contracts

- **`api.ts` is the only place that calls the Go API.** Components/hooks go through it.
- **The JWT is never in JS.** It lives only in the httpOnly cookie set by `/auth-api/verify`
  (wallet) or the Go `/auth/google` (Google). `auth.ts` / `auth-store.ts` store only
  non-sensitive markers (wallet address, Google profile) for UI. Never store a token in
  `localStorage`. `getActiveAuthToken` / token getters must not return.
- `generation-limits.ts` gates are **UX only** — the Go server independently caps batch size,
  dimensions, steps. Never treat a client-side limit as a security boundary.
- Wallet sign-in (`auth.ts`) must send the full prepared SIWE message + a fresh nonce per
  attempt; the `/auth-api/verify` route rejects reused nonces and stale/foreign-domain messages.
- `auth-store.syncFromServer()` (`/auth/me`) is the authoritative auth check; `syncFromStorage()`
  is optimistic UI only.
- Keep request/response types aligned with `types/models.ts` and the Go structs.
- **Director wire contract** (`create/director-payload.ts` → `hooks/use-director.ts`): each
  timeline SEGMENT renders as its own job against the `LTX Director 2.0` recipe — image keyframe
  at frame 0 + one prompt + optional audio slice, all inside one `timelineData` string (media
  rides inline as base64). Per-job cap is the recipe's 8s clamp; the timeline total is unbounded
  (chaining = N jobs). `segment_lengths` is **frames at 24fps** (verified live — the API guide's
  "seconds" comment is wrong) and must pair 1:1 with `local_prompts`; `normalDurationFrames` is
  `frames+1`; the timeline's `global_prompt` stays empty (top-level `prompt` wins); audio
  segments need a truthy `audioFile` or the node inpaints over the upload, and `trimStart`
  (frames) windows each segment's slice of the shared track; timeline ≤ ~24MB client-side.

## Work Guidance

- New API call → add a typed function in `api.ts`; surface via a hook and a store if shared.

## Verification

- `npm run test` (Jest) — covers `hooks/` and `utils/`. `npx tsc --noEmit`.

## Child DOX Index

- None — leaf.
