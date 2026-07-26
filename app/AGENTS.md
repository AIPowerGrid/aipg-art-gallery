# app — Next.js App Router (pages + route handlers)

## Purpose

The web app's routes. Server/client React pages for the gallery experience plus server-side
route handlers for things that must not run in the browser — including wallet authentication.

## Ownership

- Pages: `page.tsx` (home), `create/` (Studio + Director), `3d/`, `gallery/`, `favorites/`,
  `profile/`, `join/`, `auth/login/`. `layout.tsx` + `globals.css` — shell + global styles.
- Wallet-auth route handlers (server-side), the LIVE wallet sign-in path:
  - `auth-api/nonce/route.ts` — issues a one-time nonce (`lib/nonce-store`).
  - `auth-api/verify/route.ts` — verifies the SIWE signature with **viem** (handles ECDSA,
    EIP-1271, ERC-6492 smart wallets), **consumes the nonce**, validates the SIWE envelope
    (domain, address, freshness), mints the HS256 JWT, and sets the **httpOnly `aipg_auth`
    cookie**. Fails closed if `JWT_SECRET` is unset.
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
- Generation requires Google or wallet authentication and displays Core's
  promotional, daily, and purchased credit pockets. No local free counter.
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
- **`auth-api/verify` is security-critical:** never return the JWT in the body (httpOnly cookie
  only), never skip nonce consumption or SIWE validation, never add a `JWT_SECRET` fallback. Keep
  the JWT shape (HS256, `address` claim) identical to the Go `internal/auth` verifier.
- Only `NEXT_PUBLIC_*` env vars are safe in client components; route handlers may read non-public
  vars (`JWT_SECRET`, `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SECURE`).

## Work Guidance

- New page → use `lib/api.ts` for data and existing stores/hooks for auth; reuse `components/`.

## Verification

- `npm run build` (App Router type/route check, Node ≥20.9) + `npx tsc --noEmit`.

## Child DOX Index

- None — leaf.
