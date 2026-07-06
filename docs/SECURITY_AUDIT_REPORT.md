# Security Posture & Remediation Log

**Last updated:** 2026-06-22 (branch: `integration/secure-next16`)

This document records the security review of the AIPG Art Gallery and the state of each finding.
It contains **no secrets** — do not paste credentials, keys, or connection strings into this file
or any other tracked file. Secrets belong only in `.env` (gitignored) and the deployment secret store.

> Live production credentials were previously committed (R2 keys, DB password, Grid API key,
> Supabase anon JWT). They were purged from the entire git history (`git filter-repo`) and
> **rotated**. If you find any key/secret/password in a tracked file, treat it as compromised.

This branch converges the security hardening with the Next 16 / React 19 upgrade. Auth is a
hybrid: wallet sign-in via the Next.js `/auth-api` routes (viem/ERC-6492), Google One Tap via the
Go server; both share `JWT_SECRET` and deliver the JWT as an httpOnly cookie.

## Fixed

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | Critical | Live credentials committed to history | History rewritten + credentials rotated; `.env` gitignored; scripts read creds from env only |
| 2 | Critical | SIWE replay — `/auth-api/verify` issued a nonce but never consumed it, and did no SIWE-envelope validation | Consume the one-time nonce (`lib/nonce-store`) + validate domain/address/`Issued At` via the `siwe` lib before issuing the session |
| 3 | High | JWT stored in `localStorage` (XSS-exfiltratable), for both wallet and Google | JWT delivered ONLY as `HttpOnly; Secure; SameSite=Lax` cookie (set by `/auth-api/verify` and Go `/auth/google`); frontend keeps only non-sensitive markers; `/auth/me` + `/auth/logout` added |
| 4 | High | `JWT_SECRET \|\| 'dev-secret-change-me'` fallback in the verify route (forgeable tokens) | Fail closed — throws if `JWT_SECRET` unset; token lifetime 7d→24h |
| 5 | High | Generation limits enforced only client-side | Hard caps in `CreateJobRequest.Validate()` (`n`≤4, steps≤150, dims≤2048, prompt length) |
| 6 | High | RLS INSERT policy allowed ownerless rows (`OR user_id IS NULL`) | Clause removed; inserts must be attributed to `auth.uid()` |
| 7 | High | Shell injection in `scripts/import-piwigo.js` (`execSync` + interpolated filename) | `execFileSync` (argv array, no shell) |
| 8 | High (critical dep) | `fast-xml-parser` critical + `axios` high (transitive) | `npm audit fix` (non-breaking): fast-xml-parser 5.7.3, axios 1.16.0, defu, bn.js, follow-redirects |
| 9 | Medium | CORS fell back to `*` with `AllowCredentials: true` | `allowedOrigins()` fails closed; prod must set `GALLERY_ALLOWED_ORIGINS` |
| 10| Medium | CSRF on cookie-borne mutations | Origin-allowlist check in `authMiddleware` + `SameSite=Lax` |
| 11| Medium | `next/image` allowed any R2 bucket (`**.r2...`) | Pinned to the specific bucket host + `images.aipg.art` + `ik.imagekit.io` |
| 12| Medium | SSRF in `app/api/download/route.ts` (followed redirects) | `redirect: 'manual'`, reject 3xx, sanitize filename |
| 13| Low | JWT verify: non-constant-time compare, ignored `alg` | `hmac.Equal` + `alg == HS256` check (blocks alg=none) |
| 14| Low | Dead, replay-prone Go `/auth/verify` + `/auth/nonce` | Removed (frontend uses `/auth-api`) — less attack surface |
| 15| Low | `scripts/shuffle-gallery.sh` hardcoded DB password | Reads `PGPASSWORD` from the environment |
| 16| Medium | CSP allowed `'unsafe-inline'` on script-src | `middleware.ts` sets a per-request nonce + `strict-dynamic` (drops `unsafe-inline`); keeps `unsafe-eval` (web3) — **needs browser verification** |

## Verified already-correct

- Ownership (IDOR) checks on gallery update/delete/publish compare the session identity to owner.
- Rate limiting (`httprate`): 100/min/IP global, 20/min/IP on job creation.
- Static security headers present (X-Frame-Options DENY, nosniff, Referrer-Policy); CSP now in `middleware.ts`.
- No service-role Supabase key anywhere in the repo or history.

## Open / accepted risk — track separately

- **CSP (#16) needs hands-on browser verification** (wallet connect + Google One Tap + navigation)
  before it can be relied on; it can't be checked headlessly. Rollback = delete `middleware.ts`,
  restore the CSP header in `next.config.mjs`.
- **`ws` advisory** (8.0.0–8.20.1, high) remains, fanned across the WalletConnect/wagmi/reown
  tree. The only fixes are breaking wallet-lib bumps (or an `overrides`) needing browser testing.
  `npm audit fix --force` is NOT safe here — it would downgrade viem/next/wagmi/jest.
- **`@testing-library/react@14` vs React 19** peer mismatch (dev-only); install needs
  `--legacy-peer-deps`. Bump to `@testing-library/react@^16` as a cleanup.
- **Nonce stores are in-memory** (Go and `lib/nonce-store`); back with Redis if horizontally scaled.
- **`style-src 'unsafe-inline'`** kept (lower risk; many libs inject styles).
