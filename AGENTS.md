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
video, and 3D; the Director provides a browser-side timeline for chained
image-conditioned video segments. Image/video results can land in the public gallery. No
account is required to browse. Google or wallet sign-in unlocks credit-backed generation,
personal creations, publishing, and favorites. Two deployables live in one repo: a Next.js
16 web app and a Go API server that brokers generation
jobs to the grid and serves gallery/media.

## Ownership

- **`app/`** + **`components/`** + **`lib/`** + **`types/`** — the Next.js (App Router)
  frontend. Owned by `app/AGENTS.md` (routes), `components/AGENTS.md` (UI), `lib/AGENTS.md`
  (client logic, web3, API client).
- **`server/`** — the Go API server (chi). The only thing that talks to the grid, the
  blockchain vaults, R2, and Postgres. Owned in its own AGENTS.md.
- **`scripts/`** — one-off Node/Python ops + data-import + Supabase-setup scripts. Owned in
  its own AGENTS.md.
- **`deploy/`** — pinned-release LXC deployment assets and runbook.
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
  creds. All of that lives in `server/`. Browser calls use the same-origin `/api` proxy;
  server-side Next code reaches Go through `GALLERY_API_ORIGIN` (default
  `http://localhost:4000`). Never bake an absolute internal API origin into a public bundle.
- **Two processes:** `npm run dev` starts Next on 3000 and Go on 4000. Use `npm run dev:web`
  or `npm run dev:server` only when intentionally running one side.
- **Runtime:** frontend builds and production use Node 22 as pinned by `.nvmrc`;
  the backend uses the Go 1.25 toolchain pinned by `server/go.mod`. Docker,
  CI, and the LXC release build must honor both pins.
- **Product boundary:** `aipg.art` owns Gallery, Studio, and Director. Standalone
  music generation belongs to `aipg.music`; do not add an audio/music route or
  ACE-Step API surface back to this repo. Director may still use audio as part
  of a video timeline.
- **Auth:** Google or Core-issued SIWE yields an HS256 JWT in an httpOnly
  cookie. Core verifies the provider/wallet proof and returns the canonical
  account; a proved wallet can be linked to Google through Core's proof-of-both
  merge path. The Core account ID owns gallery rows, favorites, and browser job
  tracking regardless of login method. A successful proof atomically migrates
  only that proof's legacy owner key; a linked proof migrates both. Local-only
  auth is forbidden because it creates split balances.
- **Grid identity:** `AIPG_API_KEY` is the server-only bounded `aipg-art`
  service key. Google and wallet proof are verified by Core; subsequent app
  sessions exchange a server-derived Gallery-local subject. Authenticated generation carries the resulting
  short-lived `X-Grid-User-Token`; Core owns credits. Public 3D jobs are
  authenticated and delegated exactly like image and video jobs. The Gallery
  bridge key must not have direct service-inference authority. The canonical
  account returned by each service exchange must match the account in the
  signed Gallery session before credits, quotes, or generation continue.
- **Model authority is layered:** Core `/v1/status/models` is the operational
  source for online capacity, including recipe-backed public aliases. Local
  presets shape UX defaults and limits. ModelVault enriches governance metadata.
  RecipeVault is opt-in until its checkpoint names are migrated to those public
  aliases; never filter public model IDs against raw workflow filenames. Core's
  recipe-derived generation modes are authoritative for source-image support;
  local preset capabilities are only a graceful-degradation fallback.
- **Images:** generated media lives in Cloudflare R2 / `images.aipg.art`; the frontend only
  loads from allowed hosts in `next.config.mjs` — add a host there before referencing it.
- Gallery rows retain both the Gallery polling/publishing `jobId` and Core's
  `gridJobId`. Never conflate them: `gridJobId` is the receipt handle joining
  the generation to Core's completion and credit ledgers.
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
  frontend keeps only non-sensitive address, canonical account ID, profile, and
  expiry markers for optimistic UI state. `/auth/me` remains authoritative.
- **No SSRF / shell injection.** Server-side fetches of user-influenced URLs use an
  exact-host allowlist and `redirect: 'manual'`. Shell-outs use argv arrays (`execFileSync`),
  never interpolated command strings.
- **Validate before trusting the doc.** A finding marked "fixed" here or in
  `docs/SECURITY_AUDIT_REPORT.md` must be re-checked against the code before you rely on it.

## Tips for future agents

- Run the audit-relevant checks before claiming security work is done:
  `cd server && GOTOOLCHAIN=auto go test ./... && GOTOOLCHAIN=auto go vet ./...`,
  `npm run build`, `npm audit --omit=dev --audit-level=high`, and
  `govulncheck ./...` for dependency drift. CI scans the complete Git history
  with Gitleaks and analyzes both Go and TypeScript with CodeQL; keep both checks
  required before merging.
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
- [deploy/AGENTS.md](deploy/AGENTS.md) — production LXC deployment contract.
