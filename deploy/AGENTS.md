# deploy - production LXC assets

## Purpose

Source-controlled deployment contract for the `aipg.art` LXC: Nginx fronts a
Next.js web process and Go API process from one commit-pinned release.

## Ownership

- `README.md` - build, activate, verify, and rollback runbook.
- `nginx/aipg-gallery.conf` - public reverse proxy and upload limit.
- `systemd/` - frontend/API services plus the release-retention unit and timer.
- `prune-releases.sh` + the release-prune service/timer - retain the active
  release and one independently runnable rollback without filling the LXC.

## Local Contracts

- Releases are detached checkouts under
  `/opt/aipg-gallery-releases/gallery-<commit>` and are activated only through
  `/opt/aipg-gallery-current`.
- Build in `/opt/aipg-gallery-releases/.building-<commit>` and atomically rename
  only a verified artifact into `gallery-<commit>`; incomplete releases must
  never enter the retention namespace.
- Secrets stay in `/opt/aipg-gallery/gallery.env`, outside every release.
- Never place a Grid key or other secret in these tracked files.
- Build the frontend with production `NEXT_PUBLIC_*` values loaded.
- Prune frontend development dependencies after the production build so pinned
  releases and containers do not retain test/build-only packages.
- Build and run the frontend on the Node major pinned by `.nvmrc` (Node 22);
  keep Docker, CI, and the release host aligned.
- Build the backend with `GOTOOLCHAIN=auto` so the exact Go toolchain declared
  by `server/go.mod` is used.
- Preserve at least one independently runnable rollback release.
- Release pruning must resolve and protect `/opt/aipg-gallery-current`, reject
  paths outside `/opt/aipg-gallery-releases`, and keep one inactive release.

## Verification

- `nginx -t`
- `systemd-analyze verify systemd/*.service`
- Exercise `prune-releases.sh` against a temporary release tree before deploy.
- Follow the smoke and canary checks in `README.md`.

## Child DOX Index

None.
