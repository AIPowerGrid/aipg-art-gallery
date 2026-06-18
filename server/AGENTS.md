# server — Go API server (grid broker, gallery, auth)

## Purpose

The backend (chi router, Go 1.23). The only component that talks to the grid, the on-chain
vaults, Cloudflare R2, and Postgres. Brokers image/video generation jobs to the grid,
serves the gallery + media, runs SIWE auth, and proxies prompt enhancement. Entry point:
`cmd/api/main.go`; all routes + HTTP handlers live in `internal/app/app.go`.

## Ownership

- `cmd/api/main.go` — process entry: loads `.env`, builds `app.App`, serves `cfg.Address`.
- `internal/app/app.go` — the router + every HTTP handler (~2K LOC god-file). Routes under
  `/api`: auth (`/auth/nonce`, `/auth/verify`), `/models`, `/styles`, `/ai/enhance`, `/jobs`
  (create + status), public `/gallery` + `/favorites` reads, and JWT-protected
  gallery/favorites writes. CORS + IP rate limits (100/min global, 20/min on job create).
- `internal/config` — typed `Config` + `Load()` (all env reads live here).
- `internal/app` is owned here; the `internal/*` provider packages are owned in
  `internal/AGENTS.md`.
- `config/model_presets.json` — local model defaults/limits merged with on-chain models.

## Local Contracts

- **One handler file:** routes and handlers stay in `internal/app/app.go`; provider logic
  (vaults, r2, db, grid client, ai) stays in its `internal/*` package. Do not put env reads
  outside `internal/config`.
- **Graceful degradation:** if ModelVault / RecipeVault / Postgres / R2 init fails, the app
  logs and continues with a fallback (presets-only, file-store gallery, no media). Preserve
  this — a missing optional dependency must not crash startup.
- **Auth:** `/auth/nonce` issues a single-use, expiring nonce (`internal/auth` `NonceStore`).
  `/auth/verify` parses the SIWE message (`ParseSiweMessage`), validates domain + address +
  `Issued At` freshness, **consumes the one-time nonce before** verifying the EIP-191 signature
  (replay protection), then issues an HS256 JWT **as an httpOnly `aipg_auth` cookie** (the body
  returns only the address — the token never goes to JS). `/auth/me` returns the current wallet;
  `/auth/logout` clears the cookie. `authMiddleware` reads the cookie (Bearer header fallback),
  and for cookie-borne mutating requests enforces an Origin allowlist (CSRF). Cookie attributes
  come from `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SECURE` (Secure also auto-set for HTTPS). Keep
  the SIWE flow + cookie behaviour compatible with `lib/auth.ts`. Nonce store is in-memory
  (single instance).
- **Trust nothing from the client:** `CreateJobRequest.Validate()` enforces hard caps (`n`,
  steps, dimensions, prompt length) server-side regardless of frontend gating. CORS fails
  closed — `allowedOrigins()` never returns `*`; production must set `GALLERY_ALLOWED_ORIGINS`.
- **Grid passthrough:** generation goes through `internal/aipg` to the grid `/api/v2`; the
  server holds the grid key, the client never does.

## Work Guidance

- New endpoint → register in `app.Router()`, add the handler in `app.go`, wire auth + a rate
  limit if it mutates or hits the grid. Validate request structs (see `*.Validate()`).
- New config → add a field to `Config` and read it in `Load()`; document it in `.env.example`.

## Verification

- `go test ./...` (current coverage: `internal/prompts`). `go build ./...`.

## Child DOX Index

- [internal/AGENTS.md](internal/AGENTS.md) — provider/domain packages (gallery, vaults, r2, auth, aipg, ai).
