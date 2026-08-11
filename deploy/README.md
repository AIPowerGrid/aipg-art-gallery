# aipg.art production release

Production runs two services behind Nginx from one commit-pinned checkout:

- `aipg-gallery-web.service` - Next.js on `127.0.0.1:3000`
- `aipg-gallery.service` - Go API on `127.0.0.1:4000`

The release host must run the Node 22 LTS line used by `.nvmrc`, Docker, and
CI. Do not build production with a different Node major; wallet packages may
raise their minimum runtime without failing an older npm install.
Backend builds use the Go 1.25 toolchain declared in `server/go.mod`; keep
`GOTOOLCHAIN=auto` enabled so the pinned patch release is selected.

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
in Core. It must not have `inference.service_submit`: every image, video, and 3D
job carries a delegated canonical-user token. Never use an unscoped user key as
the bridge credential.

## Build a release

Resolve and review the exact commit before running these commands. Load
production `NEXT_PUBLIC_*` variables while building because Next.js embeds them.

```bash
commit="$(git rev-parse origin/main)"
release="/opt/aipg-gallery-releases/gallery-${commit:0:8}"
staging="/opt/aipg-gallery-releases/.building-${commit:0:8}"
test ! -e "$release"
test ! -e "$staging"
trap 'rm -rf -- "$staging"' EXIT
mkdir -p "$staging"
git -C "$staging" init
git -C "$staging" remote add origin https://github.com/AIPowerGrid/aipg-art-gallery.git
git -C "$staging" fetch --depth=1 origin "$commit"
git -C "$staging" checkout --detach FETCH_HEAD
set -a
. /opt/aipg-gallery/gallery.env
set +a
cd "$staging"
test "$(node -p 'process.versions.node.split(".")[0]')" = 22
npm ci
npm run build
(cd server && GOTOOLCHAIN=auto go test ./... && GOTOOLCHAIN=auto go vet ./...)
(cd server && GOTOOLCHAIN=auto go build -o ../gallery-server ./cmd/api)
mv "$staging" "$release"
trap - EXIT
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
systemctl enable --now aipg-gallery-release-prune.timer
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
systemctl is-enabled aipg-gallery-release-prune.timer
systemctl is-active aipg-gallery-release-prune.timer
```

Then run one authenticated Director canary. Confirm the result URL is readable,
the completed job survives a fresh status request, and Core records exactly one
completion ledger row for the Grid job ID. When charging is enabled, also
confirm one settled reservation and the expected credit delta. A canary without
uploaded audio may still contain model-generated audio.

After the new release and rollback are proven, run
`systemctl start aipg-gallery-release-prune.service`. The daily timer repeats
the same active-aware retention policy and keeps exactly one inactive rollback.
The dot-prefixed staging path is intentionally outside the pruner's
`gallery-*` namespace, so an interrupted clone or build can never displace a
runnable rollback.

## Roll back

Point `/opt/aipg-gallery-current` to the retained prior release, restart both
services, and repeat the smoke checks. Do not roll back by copying individual
files into the active checkout.
