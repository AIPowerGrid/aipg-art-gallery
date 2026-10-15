# server/internal — provider + domain packages

## Purpose

The backend's domain logic and external-system clients, behind the handlers in `app/`. Each
package owns one concern; `app/app.go` wires them together.

## Ownership

- `app/` — router + HTTP handlers (owned by `server/AGENTS.md`, not re-described here).
- `config/` — typed `Config` + `Load()`; the single home for `os.Getenv`.
- `videosource/` prepares owner-private local audio/video uploads using exact
  BF16 candidate windows up to481frames/24fps. Larger source windows still
  require full-length audio/picture and cannot pad, exceed byte/resource limits
  or bypass the separate source gate. Native capacity/release proof is separate.
  It uses exact
  windows, stereo48k PCM16 WAV and optional 24fps H.264 MP4. It rejects short,
  silent/ambiguous video sources, bad geometry and playlist/network formats;
  never pads sound or accepts remote URLs. Two global slots, bounded uploads,
  output sizes, tool output and deadlines apply. Linux executes codecs through
  bubblewrap with no host network/app filesystem/environment and prlimit CPU,
  address-space/file/descriptor bounds. Startup self-tests the actual sandbox
  before the independent source gate can open,
  with the distribution library cache/alternative links read-only, not all of
  `/etc`; BLAS/OpenMP initialization is single-threaded. Linux tests also prove
  zero effective capabilities and absence of host credentials.
  The resolved executable alone is bound at `/codec/tool`, not its parent;
  a versioned static codec requires separate provenance/hash/service proof.
  Deployment must verify actual PATH resolution, not accept a system fallback.
  Non-root macOS execution is
  local codec-test evidence only. Private temp files are removed on every exit.
  Preparation never quotes, reserves credits, uploads to Core/R2 or generates.
- `aipg/` — HTTP client for the new grid `/v1` (OpenAI-shaped). `GenerateMedia` is a
  single synchronous call to `/v1/images|videos|3d/generations`.
  `MediaGenerationTimeout` is the shared image/video client + detached-job
  deadline and must stay beyond Core's video ceiling. `FetchModelStats` reads
  `/v1/status/models`. `types.go` holds the request/response shapes. The async POST
  /jobs + poll contract the frontend uses is bridged in `app/pendingstore.go`.
  Transport/read failures, gateway errors, malformed success bodies and missing
  outputs have an explicitly unknown generation outcome: Core may still finish
  and charge the original job. Do not retry automatically or expose upstream
  gateway text that the Director could mistake for a safe recipe fallback.
  Definite 4xx rejections retain their existing error shape. Core's exact 503
  JSON admission detail (`This generation path is temporarily unavailable.`)
  is a pre-reservation rejection, not an uncertain job. It becomes a durable
  terminal error with no automatic retry or Director recipe fallback. Other
  5xx responses, malformed bodies and recovery 404s remain ambiguous. This classification
  is distinct from recovery: `recovery.go` reads Core's owner-bound durable
  media result without redirects or resubmission. The async broker journals
  production image/video jobs in PostgreSQL and keeps local-only preview state
  in memory. Missing or malformed recovery responses never authorize a retry.
  `client.go` exchanges namespaced gallery subjects and Core-verified
  Google/SIWE proofs for short-lived Core user tokens; the service key is
  server-only.
- `ai/` — client for grid text generation (prompt enhancement) via `/v1/chat/completions`.
- `prompts/` — model-aware prompt enhancement / category detection. Has tests.
- `gallery/` — storage layer. `GalleryStore` interface with two backends: `postgres_store.go`
  (primary) and the file-store via `FileStoreAdapter`. Plus `user_store.go`,
  `favorites_store.go`, and the versioned PostgreSQL migrations.
- `auth/` — `siwe.go` (EIP-191 verify, legacy), `jwt.go` (HS256 sign/verify with constant-time
  compare + `alg` check; dual wallet/Google claims, `JWT_SECRET`). Wallet SIWE verification for
  the live path is in the Next `/auth-api` routes, not here.
- `modelvault/` / `recipevault/` — go-ethereum clients for the on-chain registries (read-only).
- `r2/` — S3-compatible Cloudflare R2 client. `cache/` — in-memory TTL cache. `models/` — preset
  catalog loader + range/limit types.

## Local Contracts

- `aipg/ownership.go` reads Core's authenticated ownership endpoint with
  redirects disabled and a 16 KiB response cap. Canonical ID equality, UUID
  syntax, unique aliases and the 128-member bound are mandatory. No secrets or
  upstream error bodies appear in public failures.

- `aipg/video_jobs.go` supplies the default-off durable Core video broker.
  `aipg/video_limits.go` keeps BF16's candidate481-frame limit separate from
  NVFP4's337 across submission, intent hashing and the quote handler. Existing
  intent digests remain unchanged. Deploy Core's matching parser/quote/recipe
  contract first, qualify native long output and retain long-intent recovery
  readers on rollback; do not silently clamp an accepted frame count.
  It requires a delegated user token, positive
  ceiling and saved UUIDv4 request key before its single POST. `video_intent.go`
  computes Core's normalized request digest, including omitted-size semantics,
  Python-compatible Unicode/float spelling and decoded source-byte hashes.
  Submission recomputes and checks the saved digest before any HTTP request.
  The POST body disables Go Transport replay despite its Idempotency-Key;
  reused-connection reply-loss tests and a failing negative control prove this.
  Recovery uses only GET by job ID or the saved
  key and verifies that digest. No redirects, upstream-body disclosure or
  automatic submission retries. Receipt validation binds exact charges and
  terminal outputs; missing recovery is unknown, not permission to rerender or
  proof of refund. The broker must persist the intent before transport and
  validate every replay against its prior receipt before this client is used.
  Credit quote requests carry exact frames without rounded seconds. Source
  uploads/proxy limits, frontend selection and live paid acceptance remain
  rollout gates. Existing synchronous generation is unchanged.

- `app/video_broker.go` uses the existing PostgreSQL pending journal. It stores
  only the Core key/model/ceiling/optional seed and validated receipts, never
  source bodies or tokens. JSON compare-and-swap serializes cross-process
  observation; terminal receipts and their economic identity cannot change.
  Every recovery is by saved key with fresh delegated ownership. Missing/HTTP-
  rejected outcomes stay uncertain until a terminal receipt arrives; closed
  without result is not a refund claim. Real PostgreSQL concurrency and actual
  separate-process crash tests use fixture upstreams, not native billing.
  Its shared estimate validator also binds the default-off `/videos/quote`
  read to the delegated owner, exact Distilled model, frame/fps and live price.
  Quote reads may report insufficient funds but never create a job or weaken
  the generation ceiling/balance check. BF16 and NVFP4 remain separate names.
  `app/video_source.go` protects `/videos/prepare-source` with normal session,
  CSRF, canonical ownership, source gate, upload limits and rate/concurrency
  guards. Fresh source submissions separately enforce the gate after original
  intent replay and before quoting/journaling. Reference images remain closed;
  motion without explicit sound or with audio disabled is rejected. Core still
  independently decodes sources and enforces its source-path gates and holds.
- `config/video_pilot.go` validates the private canonical-account cohort and
  fixed absolute deadline. Disabled defaults admit nobody; expiry closes fresh
  quotes/jobs without rewriting journal rows or disabling GET recovery. Invalid
  enabled startup fails closed, while an expired valid config remains usable
  for recovery. Configuration loading stays in `config/`, never the handlers.

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

- [gallery/AGENTS.md](gallery/AGENTS.md) — gallery persistence and PostgreSQL migration contract.
