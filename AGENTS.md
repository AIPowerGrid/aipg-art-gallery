# DOX framework — binding work contracts for subtree owners.

AGENTS.md files are hierarchies. **Read before editing:** walk repo root → each target,
reading every AGENTS.md on the way. Closer doc controls local detail; no child may weaken DOX.
**Update after editing:** refresh the nearest owner when a change affects purpose, structure,
contracts, workflows, I/O, permissions, or the Child DOX Index. Remove stale text immediately.
**Style:** concise, current, operational. Delete stale notes instead of explaining history.

---

# aipg-art-gallery — public creative gallery + generation frontend

## Purpose

The creative frontend for the AI Power Grid: distributed GPU workers generate images,
video, 3D, and ACE-Step music; the Director provides a browser-side timeline for chained
image-conditioned video segments. Image/video results can land in the public gallery. No
account is required to browse. Google or wallet sign-in unlocks credit-backed generation,
personal creations, publishing, and favorites. Two
deployables in one repo: a Next.js 16 web app and a Go API server that brokers generation
jobs to the grid and serves gallery/media.

## Ownership

- **`app/`** + **`components/`** + **`lib/`** + **`types/`** — the Next.js (App Router)
  frontend. Owned by `app/AGENTS.md` (routes), `components/AGENTS.md` (UI), `lib/AGENTS.md`
  (client logic, web3, API client).
- **`server/`** — the Go API server (chi). The only thing that talks to the grid, the
  blockchain vaults, R2, and Postgres. Owned in its own AGENTS.md.
- **`scripts/`** — one-off Node/Python ops + data-import + Supabase-setup scripts. Owned in
  its own AGENTS.md.
- **`tests/e2e/`** — production-build browser coverage. Owned in `tests/AGENTS.md`.
- **`supabase/schema.sql`**, **`config/styles.json`**, **`data/gallery.json`** — DB schema,
  prompt-style presets, seed/file-store gallery data.
- **`docs/`** — `SECURITY_AUDIT_REPORT.md`, `GALLERY_OPTIMIZATION.md` (reference, read before
  related work). `public/` — static assets. `Dockerfile.frontend*` / `Dockerfile.server` +
  `docker-compose.yml` — deploy.

## Local Contracts

- **Inherit org engineering standards:** `../aipg-documentation/engineering-standards/`
  (core + git + the matching language file — `go.md` for `server/`, the TS/JS file for the
  frontend). The rules below are repo specializations.
- **Front/back boundary:** the browser never holds grid keys, vault RPC, R2, or Postgres
  creds. All of that lives in `server/`. The frontend talks only to the Go API
  (`NEXT_PUBLIC_GALLERY_API`, default `http://localhost:4000/api`).
- **Two ports:** frontend on 3000 (`npm run dev`), API on 4000 (`cd server && go run ./cmd/api`).
- **Auth:** Google or SIWE yields an HS256 JWT in an httpOnly cookie. A proved
  wallet can be linked to Google through Core's proof-of-both merge path.
- **Grid identity:** `AIPG_API_KEY` is the server-only bounded `aipg-art`
  service key. Google proof is verified by Core; wallet/app sessions exchange a
  Gallery-local subject. Authenticated generation carries the resulting
  short-lived `X-Grid-User-Token`; Core owns credits. Public 3D jobs are
  explicitly service-owned and constrained by the service spending ceilings.
- **Models are blockchain-sourced:** the live model list comes from the on-chain ModelVault
  (merged with local presets for defaults/limits), not a hardcoded list. RecipeVault supplies
  workflow recipes. Do not hardcode a model catalog in the frontend.
- **Images:** generated media lives in Cloudflare R2 / `images.aipg.art`; the frontend only
  loads from allowed hosts in `next.config.mjs` — add a host there before referencing it.
- Secrets come from `.env` (copy `.env.example`). Never commit creds; `POSTGRES_CONN_STR` has
  no default by design.

## Security Invariants (all subtrees)

These are non-negotiable across the repo. Children may add stricter rules, never weaker.

- **Never commit secrets.** No keys, passwords, connection strings, or tokens in any tracked
  file — including docs, comments, test fixtures, and script defaults (`x = env || "literal"`
  is a leak). Secrets live only in `.env` (gitignored). `data/gallery.json` may contain
  expired presigned URLs; do not add live ones.
- **Never trust the client.** Every limit, permission, and ownership rule must be enforced
  server-side (`server/`) and in Supabase RLS. Frontend gates (generation limits, "members
  only") are UX only; assume the browser sends arbitrary values.
- **Auth is signature → JWT in an httpOnly cookie.** SIWE sign-in is replay-protected by a
  one-time, expiring nonce + message validation (domain, address, freshness). The JWT is
  delivered ONLY as an `HttpOnly; Secure; SameSite=Lax` cookie — never returned to or stored by
  JS. Mutating routes verify it from the cookie (Bearer header fallback for non-browser
  clients), read the wallet from the token, and enforce an Origin allowlist (CSRF). The
  frontend keeps only a non-sensitive address+expiry marker for UI state.
- **No SSRF / shell injection.** Server-side fetches of user-influenced URLs use an
  exact-host allowlist and `redirect: 'manual'`. Shell-outs use argv arrays (`execFileSync`),
  never interpolated command strings.
- **Validate before trusting the doc.** A finding marked "fixed" here or in
  `docs/SECURITY_AUDIT_REPORT.md` must be re-checked against the code before you rely on it.

## Tips for future agents

- Run the audit-relevant checks before claiming security work is done:
  `cd server && GOTOOLCHAIN=auto go test ./... && GOTOOLCHAIN=auto go vet ./...`,
  `npm run build`, and `npm audit` for dependency drift.
- When you touch auth, gallery writes, or any new outbound fetch/exec, re-read this section and
  the nearest AGENTS.md, then update them if the contract changed.
## Work Guidance

- New generation capability → backend handler in `server/` first, then `lib/api.ts` client +
  `app/` UI. Keep request/response shapes in sync with `types/models.ts` and Go structs.
- New env var → add to `.env.example` and, for the backend, `server/internal/config`.

## Verification

- `npm run test:all` (Jest frontend + `go test ./...` backend). `npm run lint`, `npm run build`.
- `npm run test:e2e` for authenticated consumer-route browser flows and responsive checks.
- Backend alone: `cd server && go test ./... && go build ./...`.

## Child DOX Index

- [server/AGENTS.md](server/AGENTS.md) — Go API server (grid broker, gallery, auth, vaults).
- [server/internal/AGENTS.md](server/internal/AGENTS.md) — provider/domain packages.
- [app/AGENTS.md](app/AGENTS.md) — Next.js App Router pages + route handlers.
- [components/AGENTS.md](components/AGENTS.md) — React UI components.
- [lib/AGENTS.md](lib/AGENTS.md) — frontend client logic: API client, web3, stores, hooks.
- [scripts/AGENTS.md](scripts/AGENTS.md) — ops, data-import, and Supabase-setup scripts.
- [tests/AGENTS.md](tests/AGENTS.md) — production-build Playwright route tests.
