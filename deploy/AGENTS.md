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

- October20's MOSS rollout selects `gallery-c972bfa4` with Core0d2ee0b7.
  Exact-main provenance, host pruned-runtime and restored-backup race gates
  pass, followed by one purchased img2img/browser/reload canary at10000micro-USD.
  MOSS remains source-guided rather than an identity editor; batch/LoRA stay
  closed and the default model is unchanged. Environment, ingress and existing
  video admission are preserved. Retain `gallery-d29cbab9` for rollback and
  preserve accepted receipts. See the current acceptance record in README.md.
- The October source candidate requires Go 1.26.9 and x/net 0.60.0; the
  previous scan clearance is historical after the new advisories. Do not
  deploy or use an older security rollback without fresh source/binary scans,
  restored-backup/race proof and the ordinary drained release checks. This
  contract is not a record that the new candidate is already active.
- PR54 selected `gallery-950979d3`, the verified main release,
  retaining PR #53's chunked source uploads. Signed artifacts, host runtime
  and restored-backup race gates passed. A
  real purchased-credit opening-image/BF16 browser pilot passed exact-once
  billing and browser/API restart recovery. Public credit-backed BF16
  text/opening-image admission subsequently passed a separate27500-micro clip.
  NVFP4 text/opening-image also passed a separate27500-micro clip; BF16's
  625-frame release check passed520834-micro exact-once settlement/playback/
  seeking/reload. Public BF16 audio/video sources now pass two separately
  approved purchased canaries, native/output/audio binding, private-input
  deletion and completed-result recovery across reload/API restart. Source
  admission is `open` on Gallery and the Core `8e74ef37` source rollout
  (or a verified compatible successor), pilot fields cleared;
  source output stays337frames even with512MiB original uploads. NVFP4 sources,
  Ingredients, timelines/3D and video x402 remain closed. Retained older brokers
  are not compatible
  post-video-receipt rollback targets: keep this patched video-aware reader
  with admission disabled. See `README.md`.
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
  Gallery takes comma-separated IDs, not Core's JSON array. Validate the
  actual format before restart; never extend the deadline for recovery.
  The separately reviewed public candidate uses explicit
  `GALLERY_DURABLE_VIDEO_ADMISSION_MODE=open`, with both pilot fields cleared.
  It preserves authenticated credit quotes/holds, independent NVFP4/source
  gates and all existing receipt readers. Default mode remains `pilot`. Do not deploy
  or open it solely because a build passes: review Core's other entry points,
  capacity, public model scope and the actual public-admission approval first.
  Preserve the absolute deadline across restart; expired valid config keeps
  GET recovery. Malformed enabled config must fail startup. No live account
  IDs, credentials or source URLs belong in deployment documentation.
- Release pruning must resolve and protect `/opt/aipg-gallery-current`, reject
  paths outside `/opt/aipg-gallery-releases`, and keep one inactive release.
- Source-mode candidates require host FFmpeg/ffprobe, bubblewrap and prlimit,
  plus a successful sandbox self-test under the actual service restrictions.
  Do not disable host isolation to pass a test. Codec tests on macOS do not
  establish Linux namespace isolation. Check package security and free disk
  before installing tools. Ubuntu's restricted user namespaces may require the
  packaged `bwrap-userns-restrict` profile from `apparmor-profiles`, explicitly
  loaded by an administrator. Use the distribution profile, including its
  capability-denying child stack; never disable the host restriction, substitute
  a broadly unconfined profile or run codec tests as root to hide a failure.
  CI loads that same distribution policy before real unprivileged tests.
  A production policy load needs explicit operator approval for that exact
  profile and server-wide Bubblewrap scope; staging or CI approval is not that
  permission. Keep unapproved profiles outside active configuration.
  A separately verified static codec candidate is owned by Core's
  `deploy/MEDIA_CODEC_RUNTIME.md`; its executable alone is mounted into the
  sandbox. Verify the exact selected paths/hashes and real Gallery preparation
  under service restrictions, not just availability or a newer version number.
  Keep source admission default-off while deploying;
  qualify an independent expiring source cohort without closing public text
  video, then explicitly clear its cohort fields for source `open` mode.
  Exact source upload/job Nginx locations allow65MiB; other routes retain32MiB.
  The upload location streams its bounded body and permits75-second preparation;
  Next's direct/local proxy has the matching65MiB ceiling. Verify every outer
  proxy, not only the application handler. Rollback closes source admission on
  a source-aware release without dropping any job receipts.
  Larger original files use512MiB process-local upload tickets, never a512MiB
  request. `/api/videos/source-uploads` and its children receive <=8MiB chunks
  with streaming/no buffering and90-second read deadlines. Ordinary outer32MiB
  limits already accommodate these chunks; preserve the65MiB prepared-source/
  job routes separately. Require PrivateTmp, actual temp-filesystem capacity
  and single-process routing. Upload reservations preserve1GiB free disk and
  cap two files globally. API restart invalidates unfinished tickets and cleans
  its PrivateTmp; no generation receipt or billing row is dropped.

## Verification

- `nginx -t`
- `systemd-analyze verify systemd/*.service`
- Exercise `prune-releases.sh` against a temporary release tree before deploy.
- Follow the smoke and canary checks in `README.md`.
- `GALLERY_CMS_TEST=1 python3 -m unittest discover -s deploy -p test_release_bundle.py`
  on Linux/OpenSSL3; require the actual encryption/tamper control, not a skip.

## Child DOX Index

None.
