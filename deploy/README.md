# aipg.art production release

Production runs two services behind Nginx from one commit-pinned checkout:

- `aipg-gallery-web.service` - Next.js on `127.0.0.1:3000`
- `aipg-gallery.service` - Go API on `127.0.0.1:4000`

## Release layout

```text
/opt/aipg-gallery-releases/gallery-<commit>/  # immutable release
/opt/aipg-gallery-current -> ...              # active release
/opt/aipg-gallery/gallery.env                 # shared secrets, mode 0600
```

The environment must set
`MODEL_PRESETS_PATH=/opt/aipg-gallery-current/server/config/model_presets.json`,
`AI_MODEL=auto`, and `RECIPESVAULT_ENABLED=false`. Keep ModelVault enabled for
governance metadata. RecipeVault must remain disabled until its checkpoint names
are migrated to canonical public model aliases.

`AIPG_API_KEY` must be a Core service key bound to service client `aipg-art`
with `account.read`, `inference.submit`, `identity.exchange`, and
`identity.assert`. Configure conservative per-request and daily spend ceilings
in Core. Never use an unscoped user key as the bridge credential.

## Build a release

Resolve and review the exact commit before running these commands. Load
production `NEXT_PUBLIC_*` variables while building because Next.js embeds them.

```bash
commit="$(git rev-parse origin/main)"
release="/opt/aipg-gallery-releases/gallery-${commit:0:8}"
git clone --no-checkout https://github.com/AIPowerGrid/aipg-art-gallery.git "$release"
git -C "$release" checkout --detach "$commit"
set -a
. /opt/aipg-gallery/gallery.env
set +a
cd "$release"
npm ci
npm run build
(cd server && GOTOOLCHAIN=auto go test ./... && go vet ./...)
(cd server && GOTOOLCHAIN=auto go build -o ../gallery-server ./cmd/api)
```

## Activate

```bash
ln -sfn "$release" /opt/aipg-gallery-current
install -m 0644 deploy/systemd/*.service /etc/systemd/system/
install -m 0644 deploy/nginx/aipg-gallery.conf /etc/nginx/sites-available/aipg-gallery
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/aipg-gallery /etc/nginx/sites-enabled/aipg-gallery
systemctl daemon-reload
nginx -t
systemctl restart aipg-gallery aipg-gallery-web
systemctl reload nginx
```

## Verify

```bash
systemctl is-active aipg-gallery aipg-gallery-web nginx
curl -fsS http://127.0.0.1:4000/health
curl -fsS http://127.0.0.1:3000/create/director >/dev/null
curl -fsS https://aipg.art/api/models
curl -fsS https://aipg.art/create/director >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' https://aipg.art/audio)" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  https://aipg.art/api/audio/jobs)" = 404
```

Then run one authenticated Director canary. Confirm the result URL is readable,
the completed job survives a fresh status request, and Core records exactly one
completion ledger row for the Grid job ID. When charging is enabled, also
confirm one settled reservation and the expected credit delta. A canary without
uploaded audio may still contain model-generated audio.

## Roll back

Point `/opt/aipg-gallery-current` to the retained prior release, restart both
services, and repeat the smoke checks. Do not roll back by copying individual
files into the active checkout.
