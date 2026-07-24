# deploy - production LXC assets

## Purpose

Source-controlled deployment contract for the `aipg.art` LXC: Nginx fronts a
Next.js web process and Go API process from one commit-pinned release.

## Ownership

- `README.md` - build, activate, verify, and rollback runbook.
- `nginx/aipg-gallery.conf` - public reverse proxy and upload limit.
- `systemd/*.service` - frontend and API units.

## Local Contracts

- Releases are detached checkouts under
  `/opt/aipg-gallery-releases/gallery-<commit>` and are activated only through
  `/opt/aipg-gallery-current`.
- Secrets stay in `/opt/aipg-gallery/gallery.env`, outside every release.
- Never place a Grid key or other secret in these tracked files.
- Build the frontend with production `NEXT_PUBLIC_*` values loaded.
- Preserve at least one independently runnable rollback release.

## Verification

- `nginx -t`
- `systemd-analyze verify systemd/*.service`
- Follow the smoke and canary checks in `README.md`.

## Child DOX Index

None.
