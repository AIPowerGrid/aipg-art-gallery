# lib — frontend client logic (API, web3, stores, hooks)

## Purpose

The browser-side application logic that sits between `app/` pages and the Go API: the typed
API client, wallet/web3 integration, auth/JWT handling, Zustand stores, and React hooks.

## Ownership

- `api.ts` — the single typed client for the Go API (`NEXT_PUBLIC_GALLERY_API`, default
  `http://localhost:4000/api`). Attaches the JWT as `Authorization: Bearer` and surfaces
  `status: message` errors for rate-limit/error handling.
- `auth.ts` — JWT + wallet-address storage helpers. `wagmi.ts` — wagmi/RainbowKit config.
- `web3/` — wallet hooks/types (re-exported via `index.ts`). `supabase.ts` — Supabase client
  (social auth). `generation-limits.ts` — anon/member generation-limit logic.
- `stores/` — Zustand stores (`auth-store.ts`, `job-store.ts`).
- `hooks/` — data + UI hooks (`use-creations`, `use-generation`, `use-media-fetching`,
  `use-styles-config`, `use-wallet-address`, `use-favicon-progress`). Tested ones under
  `hooks/__tests__/`.
- `storage.ts` — client storage helpers. `utils/` — `download.ts`, `thumbnails.ts` (tested
  under `utils/__tests__/`). `types/create.ts` — create-flow types.

## Local Contracts

- **`api.ts` is the only place that calls the Go API.** Pages/components/hooks go through it,
  not raw `fetch`. New endpoints get a typed function here.
- **The JWT is never in JS.** It lives only in an httpOnly cookie set by the Go server; `api.ts`
  sends it via `credentials: 'include'` (no `Authorization` header). `auth.ts` stores only a
  non-sensitive address+expiry marker for `isAuthenticated()` UI state; `fetchSession()`
  (`/auth/me`) is the authoritative check. Never reintroduce token storage in `localStorage`.
- `generation-limits.ts` gates are **UX only** — the Go server independently caps batch size,
  dimensions, and steps. Never treat a client-side limit as a security boundary.
- SIWE sign-in (`auth.ts`) must keep sending the full prepared message + a fresh nonce per
  attempt; the backend rejects reused nonces and stale/foreign-domain messages.
- Keep request/response types aligned with `types/models.ts` and the Go structs — the API is
  the contract; mismatches surface as runtime errors.

## Work Guidance

- New API call → add a typed function in `api.ts`; surface state via a hook in `hooks/` and a
  store in `stores/` if it's shared. Add a test next to tested siblings when logic is nontrivial.

## Verification

- `npm run test` (Jest) — covers `hooks/` and `utils/` with `__tests__/`.

## Child DOX Index

- None — leaf.
