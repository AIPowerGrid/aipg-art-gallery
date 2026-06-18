# server/internal — provider + domain packages

## Purpose

The backend's domain logic and external-system clients, behind the handlers in `app/`. Each
package owns one concern; `app/app.go` wires them together.

## Ownership

- `app/` — router + HTTP handlers (owned by `server/AGENTS.md`, not re-described here).
- `config/` — typed `Config` + `Load()`; the single home for `os.Getenv`.
- `aipg/` — HTTP client for the grid `/api/v2` (create job, poll status, model status).
  `types.go` holds the grid request/response shapes.
- `ai/` — client for grid text generation (prompt enhancement); defaults to
  `https://api.aipowergrid.io/api/v2`.
- `prompts/` — model-aware prompt enhancement / category detection (Flux, SDXL, WAN, LTX).
  Has tests (`enhance_test.go`).
- `gallery/` — storage layer. `GalleryStore` interface (`interface.go`) with two backends:
  `postgres_store.go` (primary) and the file-store via `FileStoreAdapter`. Plus
  `user_store.go`, `job_store.go`, `favorites_store.go`.
- `auth/` — `siwe.go` (EIP-191 signature verify), `siwe_message.go` (EIP-4361 message parse),
  `nonce.go` (single-use, expiring nonce store for replay protection), `jwt.go` (HS256
  sign/verify with constant-time compare + `alg` check, `JWT_SECRET`). Tests in `*_test.go`.
- `modelvault/` — go-ethereum client for the on-chain ModelVault (model registry; text/image/
  video model types). `recipevault/` — on-chain workflow/recipe registry (gzip-compressed
  payloads); shares the diamond-proxy contract with ModelVault.
- `r2/` — S3-compatible Cloudflare R2 client (transient + permanent buckets, presigned URLs).
- `cache/` — in-memory TTL cache (used to throttle on-chain / grid reads).
- `models/` — `ModelPreset` catalog loader + range/limit types.

## Local Contracts

- **One concern per package; `app/` orchestrates.** Cross-package calls go through the
  interfaces/clients here, not by reaching into another package's internals.
- **Gallery writes go through `GalleryStore`.** Any new persistence operation is added to the
  interface and implemented in BOTH backends (postgres + file adapter) so degraded mode works.
- **On-chain reads are cached**, never on the request hot path uncached; the vault clients
  tolerate a disabled/failed chain (return empty, log) rather than erroring the request.
- **Vault clients are read-only** against the chain here — no transactions are signed.

## Work Guidance

- New external system → its own `internal/<name>` package with a `NewClient(...)` that fails
  soft (return a disabled client + logged warning) so `app.New` can degrade gracefully.
- Touch grid request/response shape → update `aipg/types.go` and keep it in sync with the
  frontend `types/models.ts`.

## Verification

- `go test ./...` from `server/` (today only `prompts` has tests; add tests alongside new logic).

## Child DOX Index

- None — leaf.
