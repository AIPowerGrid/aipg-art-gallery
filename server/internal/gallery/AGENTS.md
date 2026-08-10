# server/internal/gallery - gallery persistence

## Purpose

Owns public and private gallery persistence, user identity rows, favorites, and
the PostgreSQL schema lifecycle. `postgres_store.go` is the production backend;
`store.go` plus `FileStoreAdapter` is the explicitly configured local fallback.

## Ownership

- `migrations/*.sql` - ordered, immutable PostgreSQL migrations and the canonical schema history.
- `migrations.go` - embedded migration runner, checksum verification, transaction boundaries,
  and the process-wide PostgreSQL advisory lock.
- `postgres_store.go` - gallery item reads and writes.
- `user_store.go` - Google and wallet identity persistence.
- `favorites_store.go` - wallet-keyed favorites.
- `interface.go` - storage contract shared by PostgreSQL and the file backend.

`generation_jobs` remains in the baseline for compatibility with existing
databases, but active jobs are owned by `internal/app/pendingstore.go`; do not
reintroduce a second job state machine here.

## Local Contracts

- Never mutate schema from store constructors or handlers. Append a numbered SQL migration.
- Applied migration files are immutable. The runner stores SHA-256 checksums and rejects drift.
- Every migration runs in its own transaction while one session-scoped advisory lock serializes
  concurrent process starts.
- Migrations must upgrade the last production shape and build a blank database.
- Do not silently ignore migration errors. `POSTGRES_ENABLED=true` makes PostgreSQL required.
- Keep wallet writes lowercase; `users.wallet_address` remains nullable for Google-only accounts.
- `users.id` and gallery foreign keys are UUIDs represented as strings in Go.

## Work Guidance

- Name migrations `NNNN_short_description.sql` and only append new versions.
- Add any new query-supporting index in the same migration as its column or query.
- Update both `GalleryStore` implementations when behavior, rather than schema alone, changes.
- Do not put production dumps, connection strings, user rows, prompts, or media metadata in git.

## Verification

- Unit: `GOTOOLCHAIN=auto go test ./internal/gallery`
- Real PostgreSQL: set `GALLERY_TEST_POSTGRES_URL` to a disposable database and run
  `GOTOOLCHAIN=auto go test ./internal/gallery -run TestMigrationsPostgres -count=1`.
  The test creates and drops isolated schemas; never point it at a database role that cannot
  create disposable schemas.

## Child DOX Index

- None - leaf.
