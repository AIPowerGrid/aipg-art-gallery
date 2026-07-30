# server — Go API server (grid broker, gallery, auth)

## Purpose

The backend (chi router, Go ≥1.24). The only component that talks to the grid, the on-chain
vaults, Cloudflare R2, and Postgres. Brokers image, video, and 3D generation jobs,
serves the gallery + media, validates auth sessions, runs Google One Tap sign-in, and proxies prompt enhancement.
Entry point: `cmd/api/main.go`; all routes + HTTP handlers live in `internal/app/app.go`.

## Ownership

- `cmd/api/main.go` — process entry: loads `.env`, builds `app.App`, serves `cfg.Address`.
- `internal/app/app.go` — the router + every HTTP handler (~2K LOC god-file). Routes under
  `/api`: auth (`/auth/google`, `/auth/logout`, protected `/auth/me` and wallet linking), `/models`, `/styles`,
  `/ai/enhance`, `/jobs`, public `/gallery` + `/favorites` reads, and JWT-protected
  gallery/favorites writes. Protected `/gallery/me` is the identity-neutral private gallery
  read path. CORS + IP rate limits (100/min global, 20/min on job create).
- `internal/config` — typed `Config` + `Load()` (all env reads live here).
- `config/model_presets.json` — local model defaults/limits merged with on-chain models.
  Create-page UI models come from repo-root `../config/styles.json`; startup discovers it
  from either the repo root or `server/`, and `STYLES_CONFIG_PATH` can override discovery.

## Local Contracts

- **One handler file:** routes and handlers stay in `internal/app/app.go`; provider logic stays
  in its `internal/*` package. Env reads only in `internal/config`.
- **Graceful degradation:** if ModelVault / RecipeVault / Postgres / R2 init fails, the app logs
  and continues with a fallback. Preserve this — a missing optional dependency must not crash.
- Core `/v1/status/models` determines live capacity. Local presets provide UX
  shape and ModelVault enriches metadata. RecipeVault filtering is disabled by
  default until its raw checkpoint names are migrated to canonical public model
  aliases.
- **Auth:** the Go server brokers both proof paths to Core: `/auth/google`
  forwards the Google ID token, while `/auth/wallet/challenge` and
  `/auth/wallet/exchange` proxy Core-issued SIWE without exposing the Gallery
  service key. The server derives `wallet:<address>` itself; it never accepts an
  app subject from the browser. Successful proof mints the httpOnly `aipg_auth`
  cookie with the canonical Core account id and short-lived step-up token.
  Local-only login is fail-closed. The server validates cookies on protected
  routes via `authMiddleware` (Bearer fallback), serves `/auth/me` and
  `/auth/logout`, and enforces the Origin allowlist on cookie mutations.
  `jwt.go` verifies HS256 with a constant-time compare + explicit `alg` check.
  Cookie attributes come from `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` (Secure auto-set for
  HTTPS). There is intentionally no Go wallet `/auth/verify` (removed dead, replay-prone path).
- The Gallery `users.wallet_address` column is nullable because Google and
  wallet are independent login methods. `UserStore.EnsureSchema()` repairs
  legacy `NOT NULL` schemas before Google-only profiles are written.
- Private gallery reads use protected `/gallery/me`; the legacy wallet path is owner-checked.
  Never expose unpublished prompts or media through an unauthenticated wallet lookup.
- **Trust nothing from the client:** `CreateJobRequest.Validate()` enforces hard caps (`n`,
  steps, dimensions, prompt length). `allowedOrigins()` fails closed — never returns `*`;
  production MUST set `GALLERY_ALLOWED_ORIGINS`.
- **Grid passthrough:** generation goes through `internal/aipg` to the grid **`/v1`**
  (`POST /v1/images|videos|3d/generations`, synchronous; the legacy horde `/api/v2` is RETIRED —
  410 Gone). `internal/app/pendingstore.go` bridges the gallery's async `POST /api/jobs`
  and poll contract onto the synchronous grid call. The server holds the grid key, the
    client never does. Config paths are CWD-relative (`config/styles.json`,
    `./config/model_presets.json`) — run the server from the repo root.
- `/api/models` preserves Core's recipe-derived generation modes when present;
  preset capabilities are a compatibility fallback, not authority to execute a workflow.
- Jobs, prompt enhancement, and credits require the session cookie. The server
  exchanges its server-derived namespaced local subject through a scoped service account and
  sends the resulting short-lived `X-Grid-User-Token`; request bodies never
  supply a Grid key. The `aipg-art` key requires `account.read`,
  `inference.submit`, `identity.exchange`, and `identity.assert`; it is bounded
  by Core service spending ceilings and must not carry
  `inference.service_submit`. Image, video, and 3D generation are all delegated
  to the authenticated canonical user. A service exchange whose Core
  `account_id` differs from the signed Gallery session fails closed before any
  credit read, quote, enhancement, or generation. Pending job status is
  owner-bound.
- `POST /api/credits/quote` maps the local catalog model and duration to Core's
  canonical quote endpoint. Job creation repeats that preflight for immediate
  insufficient-credit UX, but Core's atomic reservation remains authoritative
  against balance races.
- Successful Core media responses persist `grid.job_id` as nullable
  `gallery_items.grid_job_id`; this receipt identifier is distinct from the
  Gallery's polling/publishing `job_id`.
- Standalone music belongs to `aipg.music`; this service intentionally exposes
  no ACE-Step or `/api/audio/jobs` surface. Director timeline audio remains
  embedded in video requests.
- Image/video generation uses the shared `aipg.MediaGenerationTimeout`
  deadline, currently 11 minutes so it remains beyond Core's 10-minute video
  ceiling. Keep the detached job context and HTTP client on that same constant.
- **Director timeline passthrough:** `CreateJobRequest.timelineData/localPrompts/segmentLengths/
  guideStrength` forward as `timeline/local_prompts/segment_lengths/guide_strength` on the grid
  request (the wire field is `timeline`, per the grid API guide). Validation: relay strings
  ≤16k chars; timeline ≤25MB and must be valid JSON (it's an opaque blob — media rides inline
  as base64 inside it, so no per-image checks are possible server-side).

## Work Guidance

- New endpoint → register in `app.Router()`, add the handler, wire auth + a rate limit if it
  mutates or hits the grid. Validate request structs.
- New config → add a field to `Config`, read it in `Load()`, document it in `.env.example`.
- Anything that mints a JWT must set it via `setAuthCookie` (httpOnly), not return it in the body.

## Verification

- `GOTOOLCHAIN=auto go test ./... && go build ./... && go vet ./...` (toolchain pinned to 1.24).

## Child DOX Index

- [internal/AGENTS.md](internal/AGENTS.md) — provider/domain packages (gallery, vaults, r2, auth, aipg, ai).
