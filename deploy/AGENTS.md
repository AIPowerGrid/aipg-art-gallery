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
- `release_bundle.py` + `test_release_bundle.py` - CI-only Linux x64 runtime
  packaging and bounded, verify-before-write extraction. The bundle contains
  the pruned Next runtime, exact Go executable, committed source, SBOMs and
  file commitments. It never selects a release or starts services.
  The encrypted payload also binds same-source standalone Go race-test
  executables and an index for restored-backup verification without compiling
  on the live LXC. These diagnostic programs are not app endpoints and must
  run only with a disposable database and no inherited application credentials.
  Runtime SBOMs do not inventory those diagnostic programs or the host OS.
- `sbom-tools/` - a separate frozen CycloneDX npm6.0.1 tool install for the
  actual pruned dependency tree. Its node_modules never ships in the runtime.
  Do not use lock-only inventory or ignore dependency errors: npm's built-in
  sbom currently rejects intentionally absent root devDependencies.

## Local Contracts

- The October source candidate requires Go 1.26.9 and x/net 0.60.0; the
  previous scan clearance is historical after the new advisories. Do not
  deploy or use an older security rollback without fresh source/binary scans,
  restored-backup/race proof and the ordinary drained release checks. This
  contract is not a record that the new candidate is already active.
- Production selects `gallery-c56d432d`, the tree-identical tested head of
  PR #41 (`f2a36e6d`), preserving PR #39's qualified image batches and patching
  gRPC to 1.83.2. Both source and binary vulnerability gates passed. Retained
  `gallery-29f472d5` contains the linked advisory and is not an unconditional
  security rollback: preserve this dependency patch in any rollback build.
  Core enabled editing/batches after real billing qualification. Timelines/3D
  remain closed. See the September 28 deployment evidence in `README.md`.
- Releases are detached checkouts under
  `/opt/aipg-gallery-releases/gallery-<commit>` and are activated only through
  `/opt/aipg-gallery-current`.
- Build in `/opt/aipg-gallery-releases/.building-<commit>` and atomically rename
  only a verified artifact into `gallery-<commit>`; incomplete releases must
  never enter the retention namespace.
- Secrets stay in `/opt/aipg-gallery/gallery.env`, outside every release.
- Never place a Grid key or other secret in these tracked files.
- Build the frontend with production `NEXT_PUBLIC_*` values loaded.
- CI release builds use only the strict public build-profile repository
  variable and public recipient certificate, never the live environment or
  application credentials. Encrypt the payload with authenticated OpenSSL CMS
  AES256-GCM/RSA-OAEP-SHA256; private Next server build metadata must not ship
  in an unencrypted public Actions artifact. The decryption key stays root-only
  on Gallery, outside releases. This certificate is for artifact encryption,
  not a TLS trust exception or an application/API credential.
- PR bundles are candidates, not deployable provenance. Only protected main
  emits GitHub attestations. Before decrypting/extracting a production bundle,
  independently verify repository, signer workflow, main ref, source commit,
  hosted runner and exact ciphertext digest; verify manifest/SBOM digests and
  the local recipient certificate afterward. No successful build auto-deploys.
- Off-host compilation does not relax restore/race, dependency, browser,
  drained activation or compatible-rollback gates. Keep at least1GiB free
  beyond the new unpacked release; reject an archive that cannot fit rather
  than pruning the selected release or rollback. Extraction needs a fresh
  dot-prefixed stage and refuses traversal, duplicate paths, devices,
  hardlinks, escaped symlinks and uncommitted/mismatched files.
- Reinstall from the lockfile with `npm ci --omit=dev` after the production
  build so releases and containers retain only exact production dependencies.
- The October frontend candidate pairs Next/ESLint 16.3.8 with sharp 0.35.5,
  Axios 1.20.0 and source-map-js 1.2.2. Tailwind's animation plugin is build-
  only and must be absent after pruning. Pass the production dependency audit,
  production build/browser tests and pruned `next start` check before promotion;
  this contract is not a record of activation or a wallet-framework upgrade.
- Build and run the frontend on the Node major pinned by `.nvmrc` (Node 22);
  keep Docker, CI, and the release host aligned.
- Build the backend with `GOTOOLCHAIN=auto` so the exact Go toolchain declared
  by `server/go.mod` is used.
- Preserve at least one independently runnable rollback release.
- For durable media recovery, deploy Core's migration 0040 and result API before
  Gallery, then verify Gallery migration 0003 against a restored backup. Retain
  journal rows on rollback; never discard receipts or redispatch uncertain jobs.
- Core's `/v1/account/ownership` must also deploy before this Gallery release:
  session renewal and durable request recovery depend on that private API.
  Its absence fails closed. Keep a compatible rollback and verify Google and
  wallet session renewal against the selected Core before public cutover.
- Durable-video activation is account-scoped and expiring, not a global flag
  flip: set private `GALLERY_DURABLE_VIDEO_PILOT_ACCOUNTS` and
  `GALLERY_DURABLE_VIDEO_PILOT_UNTIL` to the reviewed canonical cohort/deadline,
  no later than Core's own pilot. Native paid acceptance remains required.
  Preserve the absolute deadline across restart; expired valid config keeps
  GET recovery. Malformed enabled config must fail startup. No live account
  IDs, credentials or source URLs belong in deployment documentation.
- Release pruning must resolve and protect `/opt/aipg-gallery-current`, reject
  paths outside `/opt/aipg-gallery-releases`, and keep one inactive release.

## Verification

- `nginx -t`
- `systemd-analyze verify systemd/*.service`
- Exercise `prune-releases.sh` against a temporary release tree before deploy.
- Follow the smoke and canary checks in `README.md`.
- `GALLERY_CMS_TEST=1 python3 -m unittest discover -s deploy -p test_release_bundle.py`
  on Linux/OpenSSL3; require the actual encryption/tamper control, not a skip.

## Child DOX Index

None.
