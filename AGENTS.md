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
video, and 3D; Studio owns image and LTX-2.5 clip generation. Director is the
separate assembly workspace under the same Gallery header. Image/video results can land in the public gallery. No
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
  CI now prepares an encrypted, manifest/SBOM-bound Linux x64 runtime bundle
  for low-headroom hosts. Main-only provenance and local verification precede
  extraction; packaging is not activation or paid browser proof. Read its DOX.
- **`tests/e2e/`** — production-build browser coverage. Owned in `tests/AGENTS.md`.
- **`supabase/schema.sql`**, **`config/styles.json`**, **`data/gallery.json`** — DB schema,
  prompt-style presets, seed/file-store gallery data.
- **`docs/`** — `SECURITY_AUDIT_REPORT.md`, `GALLERY_OPTIMIZATION.md` (reference, read before
  related work). `public/` — static assets. `Dockerfile.frontend*` / `Dockerfile.server` +
  `docker-compose.yml` — deploy.
  `docs/DIRECTOR_SOURCE_ROLLOUT.md` tracks unified Director/source acceptance;
  implemented controls must not be mistaken for completed public qualification.

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
  the backend requires Go 1.26.9 as pinned by `server/go.mod`. Docker,
  CI, and the LXC release build must honor both pins.
- Keep x/net at least 0.60.0 and Go at least 1.26.9 for the October 2026
  HTTP/2 and standard-library advisories. Source and compiled-binary scans
  remain mandatory; a symbol finding is not proof that every advisory's
  runtime prerequisites are exposed. Historical deployment proof is not a
  current vulnerability clearance or permission to use an older rollback.
- Keep Next.js and its ESLint config pinned together at 16.3.8 or a reviewed
  newer patch, with sharp at least 0.35.5, Axios at least 1.20.0 and source-map-js
  at least 1.2.2. The October image-optimizer/dependency advisories supersede
  the earlier scan clearance. The Next.js AVIF optimizer
  advisory GHSA-2xp9-vwfh-vxw4 and sharp advisory GHSA-rgj7-g3m4-5g8c gate
  deployment; do not bypass the production dependency audit or roll back to
  affected image-processing packages to undo an unrelated UI change.
- Tailwind and its animation plugin are build-only dev dependencies. Keep
  production builds before lockfile-based pruning and verify `next start`
  afterward; do not reintroduce the vulnerable build-tool peer chain into the
  production install or suppress the high/critical audit gate.
- **Product boundary:** `aipg.art` owns Gallery, Studio, and Director. Standalone
  music generation belongs to `aipg.music`; do not add an audio/music route or
  ACE-Step API surface back to this repo. Director may still use audio as part
  of a video timeline.
- **Auth:** Google or explicit Core-issued SIWE yields an HS256 JWT in an
  httpOnly cookie. Either login method can add the other through Core's
  proof-of-both merge path. Browser wallet connection is transport state and
  never implicitly creates, replaces, or ends the Gallery session. The Core
  account ID owns gallery rows, favorites, and browser job
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
- `/auth/me` may renew a retired session ID only after Core's private
  `/v1/account/ownership` proves it belongs to the current delegated account.
  The response supplies verified aliases for browser job recovery; these are
  not wallet-connection hints. Deploy Core's ownership API before this client.
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
- The separate `/api/videos/jobs` broker defaults off. Its PostgreSQL receipt
  journal, exact-frame quote/preflight and browser preparation/recovery helpers prepare
  LTX-2.5 without enabling Core workers or public generation. Studio's
  Video workspace is visible signed in or out; server eligibility gates
  submission, not the interface. Existing jobs retain read-only recovery.
  Director preserves timelines without legacy generation. Switching Studio
  modes retains independent in-memory drafts; no uploaded source is persisted.
  Native storage/worker and purchased-
  credit qualification must precede enabling `GALLERY_DURABLE_VIDEO_ENABLED`.
  Activation requires a private canonical-account cohort and fixed expiry
  matching Core's reviewed pilot. Invalid enabled configuration fails closed;
  expired pilots retain GET recovery while refusing fresh jobs/quotes. Private
  capability discovery does not reveal cohort IDs or qualify model fidelity.
- Production selects Gallery `950979d3`; Core `8e74ef37` introduced the
  matching public source rollout. Later dependency-only Core releases retain
  this contract; read its live `/health` for the selected SHA. Public authenticated,
  credit-backed BF16 supports text/opening-image through625frames and audio/
  video sources through337frames at24fps. NVFP4 supports text/opening-image
  through337frames; NVFP4 sources, Ingredients, timeline generation and video
  x402 remain closed. Source admission is explicitly `open` on both services,
  with pilot fields cleared. Original uploads allow512MiB through bounded
  chunks; larger input files do not increase the source output limit. Two
  purchased source canaries pass native/output/audio, exact-once settlement,
  private-input deletion and completed-result reload/API-restart checks.
  These are not arbitrary identity, lip-sync or full512MiB upload proofs.
  Gallery's pilot cohort is comma-separated, unlike Core's JSON array.
  See `deploy/README.md`.
- Public-admission preparation adds explicit `GALLERY_DURABLE_VIDEO_ADMISSION_MODE`
  (`pilot` default, explicit `open`). Open mode admits only canonical,
  authenticated accounts through the unchanged positive paid-quote/hold
  protocol. NVFP4 and source modes require their independent gates. Both pilot
  fields must be empty; retained pilot restrictions must never be silently
  ignored. A source-code change does not authorize another public switch.
  Core's public entry points, capacity and
  independent admission configuration still require rollout review.
- Production image/video jobs additionally use a private PostgreSQL broker
  journal for owner-scoped request deduplication and read-only Core result
  recovery. See `server/AGENTS.md` and `deploy/README.md` for the ordered rollout
  and remaining rollout/account-merge gates. This is not global billing
  activation or a proof of the paid Director lifecycle.
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
- CI's full-history Gitleaks job uses a version-pinned, checksum-verified release
  binary. Keep both the version and SHA-256 in sync when upgrading it; do not
  replace the complete-history scan with a worktree-only scan.
- Backend CI scans both source reachability and the compiled executable.
  Record runtime prerequisites separately: a linked vulnerable symbol is not
  proof of an exposed vulnerable endpoint. Keep both scans passing.
- Browser CI installs Playwright's Chromium, not system Google Chrome. Its
  disposable runner excludes the unrelated Google Chrome apt source before
  installing Ubuntu dependencies; package verification and browser tests remain
  mandatory.

## Work Guidance

- New generation capability → backend handler in `server/` first, then `lib/api.ts` client +
  `app/` UI. Keep request/response shapes in sync with `types/models.ts` and Go structs.
- Public NVFP4 has its own default-off `GALLERY_DURABLE_VIDEO_NVFP4_ENABLED`
  rollout switch, with a matching independent Core gate and unchanged337-frame
  limit. Native/exporter/worker-credential and purchased-path qualification
  precede activation; closing it must preserve old receipt replay and GET.
- Audio/video source modes have a separate default-off
  `GALLERY_DURABLE_VIDEO_SOURCES_ENABLED` gate. Linux codec isolation, native
  source conditioning, purchased billing and cleanup must qualify before it
  opens; an available UI or codec unit test is not release acceptance.
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
