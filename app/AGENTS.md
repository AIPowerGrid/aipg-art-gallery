# app — Next.js App Router (pages + route handlers)

## Purpose

The web app's routes. Server/client React pages for the gallery experience plus server-side
route handlers for things that must not run in the browser — including wallet authentication.

## Ownership

- Pages: `page.tsx` (home), `create/` (Studio + Director), `3d/`, `gallery/`, `favorites/`,
  `profile/`, `join/`, `auth/login/`. `layout.tsx` + `globals.css` — shell + global styles.
- Retired wallet-auth route handlers:
  - `auth-api/nonce/route.ts` and `auth-api/verify/route.ts` return `410`.
    The live path is the Go `/api/auth/wallet/*` broker to Core so wallet and
    Google sessions share one canonical account.
- Other route handlers:
  - `api/download/route.ts` — proxied media download with a **strict CDN hostname allowlist**
    (`images.aipg.art`, `*.r2.cloudflarestorage.com`), `redirect: 'manual'` (no redirect
    following → SSRF-safe), and a sanitized `Content-Disposition` filename.
  - `api/og/route.tsx` + `og/route.tsx` — dynamic Open Graph images.
  - `auth/callback/route.ts` — legacy Supabase OAuth callback; the live Google path uses
    Google Identity Services and the Go `/auth/google` endpoint.

## Local Contracts

- Pages talk to the backend through `lib/api.ts` — do not `fetch` the Go API directly from a
  page. Auth state comes from `lib/` stores/hooks.
- Generation requires Google or wallet authentication. The create page displays
  Core's total spendable and purchased balances, shows promotional/daily
  pockets only when their Core `active` flags are true, and renders the
  Core-owned model quote before submission. No local free counter or price book.
  A `402` links to Console funding with a return target.
- `/join` redirects an already-authenticated Google or wallet session to
  `/create`; never leave the authenticated branch on an indefinite loading
  state.
- `/create` clears an uploaded source when selection moves to a model without
  `img2img`/`img2video`; incompatible source state must never ride a later job.
- `/create` treats an explicit live-model `offline` status as unavailable:
  identify the model as offline and disable both button and Enter-key submission.
- Standalone music is intentionally absent from `aipg.art`; it belongs to
  `aipg.music`. Do not restore an `/audio` page here.
- `/create/director` is the authenticated timeline editor for chained image-conditioned
  video segments. It uses the same owner-bound job API and Core credit enforcement as the
  standard create page; browser project/audio persistence is local convenience, not authority.
- **`proxy.ts` (repo root)** sets per-request CSP. `connect-src` must include the origin
  derived from `NEXT_PUBLIC_GALLERY_API` so cross-port Go API calls work in dev.
- **`layout.tsx`** passes the request cookie into the SSR-enabled wagmi provider; keep
  wallet storage cookie-backed so public gallery content remains server-renderable.
- **Route handlers run on the server.** The `download` proxy must keep its exact-hostname
  allowlist + `redirect: 'manual'`. Any new outbound-fetch handler needs the same discipline.
- **Do not revive a local wallet issuer.** Core must issue and consume the
  service-, subject-, origin-, wallet-, and nonce-bound challenge. The Go server
  alone mints the Gallery cookie after Core returns the canonical account.
- Only `NEXT_PUBLIC_*` env vars are safe in client components; route handlers may read non-public
  vars (`JWT_SECRET`, `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SECURE`).

## Work Guidance

- New page → use `lib/api.ts` for data and existing stores/hooks for auth; reuse `components/`.

## Verification

- `npm run build` (App Router type/route check, Node ≥20.9) + `npx tsc --noEmit`.

## Child DOX Index

- None — leaf.
