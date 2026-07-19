# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AGENTS.md is authoritative

This repo maintains a hierarchy of `AGENTS.md` files (root, `app/`, `server/`, `server/internal/`,
`components/`, `lib/`, `scripts/`) that encode binding work contracts and security invariants.
**Read the AGENTS.md on the path from repo root to any file you edit before editing**, and update the
nearest owner when a change affects purpose, structure, contracts, or env/IO. The notes below summarize;
AGENTS.md wins on any conflict.

## Commands

```bash
# Frontend (Next.js, port 3000)
npm run dev              # next dev, bound to 0.0.0.0
npm run build            # App Router type/route check + production build
npm run lint             # next lint
npx tsc --noEmit         # type-check without emitting

# Backend (Go API, port 4000) — MUST run from server/ (Go module is server/go.mod)
cd server && go run ./cmd/api      # or: npm run dev:server
# When running via `cd server`, set STYLES_CONFIG_PATH=../config/styles.json in .env
# so the create page reads the canonical repo-root config/styles.json.

# Tests
npm test                                    # Jest (frontend, jsdom)
npm test -- lib/utils/__tests__/download.test.ts   # single frontend test file
npm run test:go                             # go test ./... (from server/)
npm run test:all                            # both
cd server && GOTOOLCHAIN=auto go test ./... && go build ./... && go vet ./...  # backend gate
```

Do **not** run `go mod init` at the repo root or `go run ./server/cmd/api` from root — always `cd server`
first. Go toolchain is pinned to 1.24; Node ≥20.9.

Copy `.env.example` → `.env` and fill credentials before running. `POSTGRES_CONN_STR` has no default by design.

## Architecture

Two deployables in one repo, split by a hard security boundary:

- **Frontend** (`app/`, `components/`, `lib/`, `types/`) — Next.js 16 App Router, React 19, Tailwind,
  RainbowKit/wagmi/viem. Pages talk to the backend **only** through `lib/api.ts` (never `fetch` the Go API
  directly from a page). Auth/UI state lives in `lib/stores` + `lib/hooks`.
- **Backend** (`server/`) — Go chi router, Go ≥1.24. The **only** component with grid keys, vault RPC, R2,
  and Postgres credentials. The browser never holds any of these. Frontend → Go API via
  `NEXT_PUBLIC_GALLERY_API` (default `http://localhost:4000/api`).

### The security boundary is the core invariant
The browser never holds grid keys, vault RPC, R2, or DB creds — all live in `server/`. Every limit,
permission, and ownership rule must be enforced server-side (and in Supabase RLS); frontend gates
(generation limits, "members only") are UX only. Assume the client sends arbitrary values.

### Backend shape (`server/`)
- `cmd/api/main.go` — entry point (loads `.env`, builds `app.App`).
- `internal/app/app.go` — the router + **every HTTP handler** (~2K-LOC god-file, by design). New endpoints
  register here; provider logic stays in its own `internal/*` package.
- `internal/config` — the **single** home for `os.Getenv`. New env var → add a `Config` field, read it in
  `Load()`, document in `.env.example`.
- `internal/{aipg,ai,gallery,modelvault,recipevault,r2,cache,prompts,auth,models}` — one concern per package,
  wired together by `app/`. Cross-package calls go through interfaces.
- **Graceful degradation**: if ModelVault / RecipeVault / Postgres / R2 init fails, the app logs and
  continues on a fallback. A missing optional dependency must never crash the server. `gallery.GalleryStore`
  has two backends (Postgres primary + file-store) — new persistence ops go in the interface and **both**
  backends.

### Auth flow (split across two issuers, one JWT format)
- **Wallet sign-in (SIWE on Base)** is handled in the **Next.js** route handlers `app/auth-api/nonce` +
  `app/auth-api/verify` (viem — ECDSA, EIP-1271, ERC-6492 smart wallets), which consume a one-time nonce,
  validate the SIWE envelope, mint an **HS256 JWT**, and set it as an **httpOnly `aipg_auth` cookie**.
- **Google One Tap** is minted by the **Go** server (`/auth/google`).
- Both issuers produce the **same** JWT shape (HS256, `address` claim, shared `JWT_SECRET`) — keep
  `app/auth-api/verify/route.ts` and `server/internal/auth/jwt.go` in sync or cookies won't validate
  cross-issuer. The JWT is delivered **only** as an `HttpOnly; Secure; SameSite=Lax` cookie — never returned
  to or stored by JS. Frontend sends it via `credentials: 'include'`; Bearer header is a fallback for
  non-browser CLI clients. Mutating routes verify the cookie and enforce an Origin allowlist (CSRF);
  `allowedOrigins()` fails closed (never `*`).

### Models are blockchain-sourced
The live model list comes from the on-chain **ModelVault** (merged with `config/model_presets.json` for
defaults/limits), and **RecipeVault** supplies workflow recipes — never hardcode a model catalog in the
frontend. Create-page UI models come from repo-root `config/styles.json` (via `STYLES_CONFIG_PATH`). Keep
grid request/response shapes in sync across `server/internal/aipg/types.go`, the Go structs, and
`types/models.ts`.

### Generation flow
Frontend (`lib/api.ts`) → Go `/api/jobs` → `internal/aipg` brokers to the grid (`/v1` OpenAI-shaped;
async POST-jobs+poll bridged in `app/pendingstore.go`) → generated media stored in Cloudflare R2 /
`images.aipg.art`. The frontend loads images only from hosts allowlisted in `next.config.mjs` — add a host
there before referencing it. Server-side fetches of user-influenced URLs (e.g. `app/api/download`) use an
exact-host allowlist + `redirect: 'manual'` (SSRF-safe).

### Frontend specifics
- `middleware.ts` (repo root) sets per-request CSP; `connect-src` must include the origin from
  `NEXT_PUBLIC_GALLERY_API` so cross-port dev calls work.
- `layout.tsx` loads `Providers` via `dynamic(..., { ssr: false })` so wallet libs never touch `indexedDB`
  during SSR.
- Only `NEXT_PUBLIC_*` env vars are safe in client components; route handlers may read secret vars
  (`JWT_SECRET`, `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SECURE`).

## Adding a generation capability
Backend handler in `server/` first → `lib/api.ts` client → `app/` UI. Keep request/response shapes in sync
across Go structs and `types/models.ts`.
