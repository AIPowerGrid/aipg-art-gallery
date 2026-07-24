# server — Go API server (grid broker, gallery, auth)

## Purpose

The backend (chi router, Go ≥1.24). The only component that talks to the grid, the on-chain
vaults, Cloudflare R2, and Postgres. Brokers image, video, 3D, and audio generation jobs,
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
- **Auth:** wallet sign-in is NOT handled here — it lives in the Next `/auth-api/*` routes
  (viem/ERC-6492), which mint the JWT and set the httpOnly `aipg_auth` cookie. The Go server:
  (a) mints+sets the same cookie for Google One Tap (`/auth/google`); (b) validates the cookie
  on protected routes via `authMiddleware` (Bearer header fallback for CLI); (c) serves
  `/auth/me` and `/auth/logout`. `authMiddleware` enforces an Origin allowlist on cookie-borne
  mutations (CSRF). `jwt.go` verifies HS256 with a constant-time compare + explicit `alg` check.
  Cookie attributes come from `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` (Secure auto-set for
  HTTPS). There is intentionally no Go wallet `/auth/verify` (removed dead, replay-prone path).
- Private gallery reads use protected `/gallery/me`; the legacy wallet path is owner-checked.
  Never expose unpublished prompts or media through an unauthenticated wallet lookup.
- **Trust nothing from the client:** `CreateJobRequest.Validate()` enforces hard caps (`n`,
  steps, dimensions, prompt length); audio independently caps body size, duration,
  inference steps, prompt/lyrics length, and seed. `allowedOrigins()` fails closed — never returns `*`;
  production MUST set `GALLERY_ALLOWED_ORIGINS`.
- **Grid passthrough:** generation goes through `internal/aipg` to the grid **`/v1`**
  (`POST /v1/images|videos|audio/generations`, synchronous; the legacy horde `/api/v2` is RETIRED —
  410 Gone). `internal/app/pendingstore.go` bridges the gallery's async `POST /api/jobs`
  and poll contract onto the synchronous grid call. The server holds the grid key, the
    client never does. Config paths are CWD-relative (`config/styles.json`,
    `./config/model_presets.json`) — run the server from the repo root.
- Jobs, prompt enhancement, and credits require the session cookie. The server
  exchanges its namespaced local subject through a scoped service account and
  sends the resulting short-lived `X-Grid-User-Token`; request bodies never
  supply a Grid key. The `aipg-art` key requires `account.read`,
  `inference.submit`, `identity.exchange`, and `identity.assert`; it is bounded
  by Core service spending ceilings. Public 3D is explicitly service-owned.
  Pending job status is owner-bound.
- Audio uses Core's fixed governed model name and a 33-minute client deadline.
  Pending state must outlive that deadline; do not reduce its TTL below the
  audio ceiling.
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
