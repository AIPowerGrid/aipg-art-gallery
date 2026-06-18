# app — Next.js App Router (pages + route handlers)

## Purpose

The web app's routes. Server/client React pages for the gallery experience plus a few
server-side route handlers for things that must not run in the browser.

## Ownership

- Pages: `page.tsx` (home), `create/`, `gallery/`, `favorites/`, `profile/`, `join/`,
  `auth/login/`. `layout.tsx` + `globals.css` — shell + global styles.
- Route handlers (server-side):
  - `api/download/route.ts` — proxied media download with **strict CDN hostname allowlist**
    (SSRF guard; only `images.aipg.art` and `*.r2.cloudflarestorage.com`). Uses
    `redirect: 'manual'` and rejects 3xx so an allowed-host open-redirect can't be chained to
    an internal target; the `Content-Disposition` filename is sanitized.
  - `api/og/route.tsx` + `og/route.tsx` — dynamic Open Graph images (edge runtime), built
    from recent gallery images.
  - `auth/callback/route.ts` — Supabase OAuth callback (social sign-in).

## Local Contracts

- Pages talk to the backend through `lib/api.ts` — do not `fetch` the Go API directly from a
  page. Wallet state + JWT come from `lib/` (stores/hooks), not local component state.
- **Route handlers run on the server**: the `download` proxy must keep its exact-hostname
  allowlist (no substring matches) to stay SSRF-safe. Any new outbound-fetch handler needs
  the same allowlist discipline.
- Only `NEXT_PUBLIC_*` env vars are safe to reference from client components; server route
  handlers may read non-public vars.

## Work Guidance

- New page → use `lib/api.ts` for data and the existing stores/hooks for auth; reuse
  `components/` rather than inlining UI.

## Verification

- `npm run build` (App Router type/route check) + `npm run lint`.

## Child DOX Index

- None — leaf.
