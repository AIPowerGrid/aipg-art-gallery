# DOX framework

- DOX is a hierarchy of AGENTS.md files that carry the durable contracts for this repo.
- Agents must follow the DOX chain on every edit.

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees.
- Any work product must stay understandable from the nearest AGENTS.md plus every parent above it.

## Read Before Editing

1. Read this root AGENTS.md.
2. Identify every path you expect to touch.
3. Walk from repo root to each target, reading every AGENTS.md on the way.
4. The nearest AGENTS.md is the local contract; parents hold repo-wide rules.
5. If docs conflict, the closer doc controls local detail, but no child may weaken DOX.

Do not rely on memory — re-read the applicable chain in-session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done. Update the closest
owning AGENTS.md when a change affects: purpose/scope/ownership; durable structure,
contracts, or workflows; inputs/outputs/permissions/side-effects; or the Child DOX Index.
Remove stale text immediately. Refresh affected parent and child indexes.

## Style

Concise, current, operational. Stable contracts, not diary entries. Broad rules in parents,
concrete detail in children. Delete stale notes instead of explaining history.

---

# aipg-art-gallery — free AI image gallery + generation frontend

## Purpose

The creative frontend for the AI Power Grid: describe an image, distributed GPU workers
generate it, results land in a public gallery. No account required to browse; wallet
sign-in (SIWE on Base) unlocks personal creations, publishing, and favorites. Two
deployables in one repo: a Next.js 14 web app and a Go API server that brokers generation
jobs to the grid and serves gallery/media.

## Ownership

- **`app/`** + **`components/`** + **`lib/`** + **`types/`** — the Next.js 14 (App Router)
  frontend. Owned by `app/AGENTS.md` (routes), `components/AGENTS.md` (UI), `lib/AGENTS.md`
  (client logic, web3, API client).
- **`server/`** — the Go API server (chi). The only thing that talks to the grid, the
  blockchain vaults, R2, and Postgres. Owned in its own AGENTS.md.
- **`scripts/`** — one-off Node/Python ops + data-import + Supabase-setup scripts. Owned in
  its own AGENTS.md.
- **`supabase/schema.sql`**, **`config/styles.json`**, **`data/gallery.json`** — DB schema,
  prompt-style presets, seed/file-store gallery data.
- **`docs/`** — `SECURITY_AUDIT_REPORT.md`, `GALLERY_OPTIMIZATION.md` (reference, read before
  related work). `public/` — static assets. `Dockerfile.frontend*` / `Dockerfile.server` +
  `docker-compose.yml` — deploy.

## Local Contracts

- **Inherit org engineering standards:** `/Users/j/fix-axios-vuln/aipg-documentation/engineering-standards/`
  (core + git + the matching language file — `go.md` for `server/`, the TS/JS file for the
  frontend). The rules below are repo specializations.
- **Front/back boundary:** the browser never holds grid keys, vault RPC, R2, or Postgres
  creds. All of that lives in `server/`. The frontend talks only to the Go API
  (`NEXT_PUBLIC_GALLERY_API`, default `http://localhost:4000/api`).
- **Two ports:** frontend on 3000 (`npm run dev`), API on 4000 (`cd server && go run ./cmd/api`).
- **Auth:** SIWE → the Go server issues an HS256 JWT (`JWT_SECRET`); the frontend sends it as
  `Authorization: Bearer`. Same secret must be set both sides of any deploy.
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

- Run the audit-relevant checks before claiming security work is done: `cd server && go test
  ./... && go vet ./...`, `npm run build`, and `npm audit` for dependency drift.
- When you touch auth, gallery writes, or any new outbound fetch/exec, re-read this section and
  the nearest AGENTS.md, then update them if the contract changed.

## Work Guidance

- New generation capability → backend handler in `server/` first, then `lib/api.ts` client +
  `app/` UI. Keep request/response shapes in sync with `types/models.ts` and Go structs.
- New env var → add to `.env.example` and, for the backend, `server/internal/config`.

## Verification

- `npm run test:all` (Jest frontend + `go test ./...` backend). `npm run lint`, `npm run build`.
- Backend alone: `cd server && go test ./... && go build ./...`.

## Child DOX Index

- [server/AGENTS.md](server/AGENTS.md) — Go API server (grid broker, gallery, auth, vaults).
- [app/AGENTS.md](app/AGENTS.md) — Next.js App Router pages + route handlers.
- [components/AGENTS.md](components/AGENTS.md) — React UI components.
- [lib/AGENTS.md](lib/AGENTS.md) — frontend client logic: API client, web3, stores, hooks.
- [scripts/AGENTS.md](scripts/AGENTS.md) — ops, data-import, and Supabase-setup scripts.
