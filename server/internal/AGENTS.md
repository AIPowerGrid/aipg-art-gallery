# server/internal — provider + domain packages

## Purpose

The backend's domain logic and external-system clients, behind the handlers in `app/`. Each
package owns one concern; `app/app.go` wires them together.

## Ownership

- `app/` — router + HTTP handlers (owned by `server/AGENTS.md`, not re-described here).
- `config/` — typed `Config` + `Load()`; the single home for `os.Getenv`.
- `aipg/` — HTTP client for the new grid `/v1` (OpenAI-shaped). `GenerateMedia` is a
  single synchronous call to `/v1/images|videos|3d/generations`.
  `MediaGenerationTimeout` is the shared image/video client + detached-job
  deadline and must stay beyond Core's video ceiling. `FetchModelStats` reads
  `/v1/status/models`. `types.go` holds the request/response shapes. The async POST
  /jobs + poll contract the frontend uses is bridged in `app/pendingstore.go`.
  `client.go` exchanges namespaced gallery subjects and Core-verified
  Google/SIWE proofs for short-lived Core user tokens; the service key is
  server-only.
- `ai/` — client for grid text generation (prompt enhancement) via `/v1/chat/completions`.
- `prompts/` — model-aware prompt enhancement / category detection. Has tests.
- `gallery/` — storage layer. `GalleryStore` interface with two backends: `postgres_store.go`
  (primary) and the file-store via `FileStoreAdapter`. Plus `user_store.go` (incl. Google
  account columns), `job_store.go`, `favorites_store.go`.
- `auth/` — `siwe.go` (EIP-191 verify, legacy), `jwt.go` (HS256 sign/verify with constant-time
  compare + `alg` check; dual wallet/Google claims, `JWT_SECRET`). Wallet SIWE verification for
  the live path is in the Next `/auth-api` routes, not here.
- `modelvault/` / `recipevault/` — go-ethereum clients for the on-chain registries (read-only).
- `r2/` — S3-compatible Cloudflare R2 client. `cache/` — in-memory TTL cache. `models/` — preset
  catalog loader + range/limit types.

## Local Contracts

- **One concern per package; `app/` orchestrates.** Cross-package calls go through interfaces.
- **Gallery writes go through `GalleryStore`** — new persistence ops are added to the interface
  and implemented in BOTH backends so degraded mode works.
- **On-chain reads are cached**; vault clients tolerate a disabled/failed chain (return empty,
  log) rather than erroring the request. Vault clients are read-only (no transactions signed).
- **JWT claims are Go-issued.** Keep the `address`, `grid_access_token`, and
  `grid_account_id` fields server-only inside the httpOnly cookie. The retired
  Next auth routes return `410` and must not become a second issuer.

## Work Guidance

- New external system → its own `internal/<name>` package with a `NewClient(...)` that fails soft.
- Touch grid request/response shape → update `aipg/types.go` and keep it in sync with `types/models.ts`.

## Verification

- `GOTOOLCHAIN=auto go test ./...` from `server/` (add tests alongside new logic).

## Child DOX Index

- None — leaf.
