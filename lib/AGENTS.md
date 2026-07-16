# lib — frontend client logic (API, web3, stores, hooks)

## Purpose

The browser-side application logic between `app/` pages and the backends: the typed API client,
wallet/web3 integration, auth/session handling, Zustand stores, and React hooks.

## Ownership

- `api.ts` — the single typed client for the Go API, including image/video and
  governed audio job submission. Sends the session cookie via
  `credentials: 'include'` (no `Authorization` header). Surfaces `status: message` errors.
- `auth.ts` — wallet sign-in (calls the Next `/auth-api/*` routes), session helpers, and the
  non-sensitive session marker (address + expiry). Exposes `signIn`, `signOut` (→ Go
  `/auth/logout`), `fetchSession` (→ Go `/auth/me`), `isAuthenticated`, `getApiBase`.
- `nonce-store.ts` — in-memory one-time nonce store used by the `/auth-api` routes
  (`storeNonce` / `consumeNonce` / `cleanupNonces`). Replace with Redis if multi-instance.
- `wagmi.ts` — wagmi/RainbowKit config. `web3/` — wallet hooks/types. `supabase.ts` — Supabase
  client. Core's `/account/credits` response is the only credit authority.
- `stores/` — Zustand stores (`auth-store.ts` supports wallet + Google; `job-store.ts`).
- `hooks/` — data + UI hooks. `storage.ts`, `utils/` (`download.ts`, `thumbnails.ts`),
  `types/create.ts`.

## Local Contracts

- **`api.ts` is the only place that calls the Go API.** Components/hooks go through it.
- **The JWT is never in JS.** It lives only in the httpOnly cookie set by `/auth-api/verify`
  (wallet) or the Go `/auth/google` (Google). `auth.ts` / `auth-store.ts` store only
  non-sensitive markers (wallet address, Google profile) for UI. Never store a token in
  `localStorage`. `getActiveAuthToken` / token getters must not return.
- Generation requires an authenticated Google or wallet session. The Go server independently caps batch size,
  dimensions, steps, audio duration, prompt/lyrics length, and seed. Never treat a client-side limit as a security boundary.
- Wallet sign-in (`auth.ts`) must send the full prepared SIWE message + a fresh nonce per
  attempt; the `/auth-api/verify` route rejects reused nonces and stale/foreign-domain messages.
- `auth-store.syncFromServer()` (`/auth/me`) is the authoritative auth check; `syncFromStorage()`
  is optimistic UI only.
- Keep request/response types aligned with `types/models.ts` and the Go structs.

## Work Guidance

- New API call → add a typed function in `api.ts`; surface via a hook and a store if shared.

## Verification

- `npm run test` (Jest) — covers `hooks/` and `utils/`. `npx tsc --noEmit`.

## Child DOX Index

- None — leaf.
