# aipg.art production release

## Current Public Video Scope

Protected-main PR54 release `950979d3` is deployed with Core `8e74ef37`.
Public authenticated, credit-backed BF16/NVFP4 text/opening-image admission
continues: BF16 supports625frames at24fps (26.04seconds); NVFP4 retains337frames
(14.04seconds). The separately approved actual
625-frame BF16 release check consumed USD0.520834 with one dispatch/settlement/
completion, matching full native decode, playback/seeking and reload recovery.
The older private-pilot record below is historical. BF16 audio-to-video and
video-to-video are now public for authenticated, credit-backed accounts, with
one active video per account and337-frame output. The two purchased source
canaries pass native graph/output binding, full decode, exact output clocks,
original soundtrack correlation, one dispatch/charge/completion per job,
private-input deletion and completed-result reload/API-restart recovery.
Both tests used short diagnostic sources on one GPU; they do not qualify
arbitrary identity replacement, lip sync, full512MiB browser uploads or every
accepted source format. NVFP4 sources, Ingredients, timeline generation and
video x402 remain closed. This document is not authority to widen them.

The source implementation retains a separate default-off
`GALLERY_DURABLE_VIDEO_SOURCES_ENABLED` gate. Before enabling it, install and
security-check FFmpeg/ffprobe, bubblewrap and prlimit; run the actual Linux codec
and isolation tests under the service restrictions. Startup must fail rather
than fall back to an unsandboxed codec. Container runtimes that cannot create
the required namespaces must keep source modes disabled; do not grant broad
container privileges to bypass this gate.

Use `GALLERY_DURABLE_VIDEO_SOURCES_ADMISSION_MODE=pilot` with private comma-
separated `GALLERY_DURABLE_VIDEO_SOURCES_PILOT_ACCOUNTS` and a fixed aware
`GALLERY_DURABLE_VIDEO_SOURCES_PILOT_UNTIL` within24hours for the bounded source
canary. This source cohort is independent of the existing public text-video
mode. Core needs matching source-account admission plus its audio/video path
gates; enabling its paths globally before a source-account gate exists is not
a private canary. Only after purchased A2V/V2V acceptance, failure/replay and
private-input cleanup may source mode become `open` with both pilot fields
cleared. Existing source receipts must remain recoverable on rollback.

Verify65MiB source-upload and durable-video body limits across every public
proxy. The upload route has a75-second application deadline and90-second
Nginx response allowance. The source body never belongs in request logs,
Gallery journals, browser storage or a public bucket. Preparation creates no
hold/job; generation still needs the exact live quote and atomic Core hold.

The larger-source implementation accepts original files up to512MiB without raising
site-wide request limits. Files<=64MiB use the existing multipart route. Larger
files use authenticated `POST /api/videos/source-uploads` with exact size,
mode/window/geometry; sequential `PUT /api/videos/source-uploads/{id}?offset=N`
requests carry at most8MiB each. One `POST .../{id}/prepare` consumes the exact
file and returns only the selected normalized window. `DELETE .../{id}` is
owner-bound, idempotent cleanup and remains usable after source-cohort expiry.
No endpoint accepts a source URL or creates a generation.

Verify the matching streaming8MiB prefix location and90-second response timeout
at Gallery; ordinary outer32MiB limits accommodate each chunk. Keep the separate
65MiB normalized job/multipart routes intact. Tickets are process-local, require
one API process, and expire after90seconds idle or15minutes absolute. One ticket
per account/two globally plus full-file reservations above1GiB free disk bound
storage. Keep PrivateTmp enabled for crash cleanup; unfinished uploads cannot
resume across API restart and never constitute an unknown paid generation.
Opening source modes requires matching Core/worker limits: source-conditioned
output stays337frames even though the normalizer can prepare625. A larger
original file does not qualify a longer GPU source job.

## LTX-2.5 private pilot qualification

Release `0469027d` is deployed. Its required main checks, signed release
provenance, host runtime and restored-backup race tests passed. A real funded
browser generated a Krea 2 Turbo opening image and used it for an 81-frame
Distilled BF16 clip. The image cost USD 0.005 and the clip USD 0.0675: total
USD 0.0725 under a separate USD 0.10 canary ceiling. Both jobs had one settled
reservation, purchased debit and completion. Video dispatched once.

The original 960x544, 24fps, 3.375-second clip played and recovered after a
browser reload and an actual Gallery API restart, without a replacement job.
This qualifies the opening-image path in a private account-scoped pilot,
not public video admission, NVFP4 Gallery use, every video control or x402.
Existing legacy timeline/3D gates are unchanged. Pilot identities, deadlines,
operational evidence and rollback records remain in private operator state.

## CI-built release bundle

The new `Verified release bundle` job follows the frontend/backend/browser/
history gates. It compiles on Linux x64/Ubuntu22.04, honors Node22 and Go1.26.9,
tests the pruned `next start`, scans the actual backend executable and generates
CycloneDX inventories from installed frontend dependencies and the compiled
backend. `release_bundle.py` binds committed source, the source tree, toolchain,
public build profile and every runtime file. Build caches and live environment
files are excluded. The existing `next start` layout is preserved.
The frontend inventory uses the separately locked official CycloneDX npm6.0.1
generator against the actual pruned install, without ignoring npm errors or
substituting a lock-only inventory. This avoids npm's built-in SBOM checker
rejecting intentionally absent root development dependencies. Tool dependencies
are outside the shipped production node_modules.
CI also compiles each backend test package into a same-source standalone race
control, committed by `qualification/index.json` and the bundle's file hashes.
Use those controls with their recorded package working directories, a sanitized
environment and a disposable restored PostgreSQL database. This avoids adding
compiler/toolchain caches on the live LXC. Never supply the live DSN or inherit
Grid/storage/session credentials. Runtime SBOMs cover the production Node/Go
dependencies, not these diagnostic programs or the host OS.

Configure only `GALLERY_PUBLIC_BUILD_ENV_JSON` (validated public Google client
ID, WalletConnect project ID, relative `/api`, Base8453 and optional public
ModelVault addresses) and `GALLERY_RELEASE_RECIPIENT_CERT` in repository variables.
No Grid, database, OAuth-secret, session or storage credential is supplied to CI.
The root-only recipient private key is generated and retained on Gallery,
outside releases. The generated payload contains private Next server metadata;
therefore Actions publishes only authenticated CMS ciphertext, a non-secret
digest manifest and SBOMs, never the plaintext archive. Encryption uses
AES256-GCM and RSA-OAEP-SHA256 with a3072-bit-or-larger recipient. It is not TLS.

PR artifacts are test candidates. Protected main separately signs the four
published subjects through GitHub provenance. Before production extraction,
verify both ciphertext and `release.json`, not merely a downloaded checksum:

```bash
gh attestation verify gallery-linux-x64.tar.gz.cms \
  --repo AIPowerGrid/aipg-art-gallery \
  --signer-workflow AIPowerGrid/aipg-art-gallery/.github/workflows/ci.yml \
  --source-ref refs/heads/main --source-digest "$reviewed_commit" \
  --deny-self-hosted-runners
gh attestation verify release.json \
  --repo AIPowerGrid/aipg-art-gallery \
  --signer-workflow AIPowerGrid/aipg-art-gallery/.github/workflows/ci.yml \
  --source-ref refs/heads/main --source-digest "$reviewed_commit" \
  --deny-self-hosted-runners
```

Also verify that every exact-main required check, including CodeQL, passed.
Read back the source commit/platform/cipher, ciphertext byte count/SHA256,
SBOM digests and recipient-certificate fingerprint from the attested manifest.
Copy only that ciphertext into a root-only temporary directory on Gallery.
Decrypt there using the matched local recipient key/certificate; do not copy
the private key to a workstation or CI. Verify plaintext archive size/SHA256
against the attested manifest before calling the current reviewed verifier.

```bash
openssl cms -decrypt -binary -inform DER -in "$ciphertext" \
  -recip "$recipient_certificate" -inkey "$recipient_private_key" \
  -out "$private_archive"
python3 deploy/release_bundle.py verify --archive "$private_archive" \
  --commit "$reviewed_commit"
python3 deploy/release_bundle.py extract --archive "$private_archive" \
  --commit "$reviewed_commit" --destination "$fresh_staging_directory"
```

The verifier checks complete file commitments before writing, rejects unsafe
archive/link forms, refuses an existing destination and preserves1GiB of free
headroom beyond the unpacked release. It does not rename/select the stage or
restart services. Preserve failed stages for reconciliation. Complete ordinary
restored-backup/race, local executable/runtime, environment/source and drained
activation checks next. Once video receipts exist, use a video-aware patched
rollback with admission disabled and GET recovery intact; do not select the
old broker or drop metadata. No pilot deadline, charging or tariff changes are
implied by downloading or building a bundle.

## Durable video pilot controls

The public-admission candidate adds
`GALLERY_DURABLE_VIDEO_ADMISSION_MODE=pilot|open`, defaulting to `pilot`.
Explicit `open` requires empty pilot account/expiry fields and permits new
BF16 jobs only. It does not expose NVFP4, bypass canonical authentication,
allow preview/unpriced quotes or remove Core's atomic credit hold. Existing
NVFP4 intent replay and owner-bound result recovery remain available. Unknown
modes and attempts to ignore retained pilot restrictions fail closed. This is
preparation, not a record of public activation; review Core's entry points,
worker capacity and rollout authorization before changing either service.

Keep `GALLERY_DURABLE_VIDEO_ENABLED=false` until native worker/storage and real
funded acceptance are reviewed. Activation requires private
`GALLERY_DURABLE_VIDEO_PILOT_ACCOUNTS` (1..10 canonical Core IDs) and
`GALLERY_DURABLE_VIDEO_PILOT_UNTIL` (fixed RFC3339 deadline at most 24h ahead).
Gallery's account list is comma-separated canonical UUIDs, not Core's JSON
array. Keep actual identities and deadlines in the private environment.
Match Core's reviewed cohort and do not outlive its expiry. Never publish live
IDs or renew a deadline solely for recovery. New quotes/jobs close on expiry;
GET recovery and existing request identity remain available. Validate disabled,
outside-account, expiry and unchanged-deadline restart against a restored
scratch database before selecting the video-aware release. Capability discovery
is authenticated/no-store and reveals no cohort list or credentials. These
candidate controls are not proof of consumer activation or paid GPU output.

Production runs two services behind Nginx from one commit-pinned checkout:

- `aipg-gallery-web.service` - Next.js on `127.0.0.1:3000`
- `aipg-gallery.service` - Go API on `127.0.0.1:4000`

The release host must run the Node 22 LTS line used by `.nvmrc`, Docker, and
CI. Do not build production with a different Node major; wallet packages may
raise their minimum runtime without failing an older npm install.
Backend builds require Go 1.26.9 as declared in `server/go.mod`; keep
`GOTOOLCHAIN=auto` enabled so the pinned patch release is selected.

## October 2026 backend patch gate

The candidate requires Go 1.26.9 and x/net 0.60.0. The prior Go 1.25.13 /
x/net 0.58.0 build now fails the refreshed source and compiled-binary advisory
checks, including [GO-2026-6610](https://pkg.go.dev/vuln/GO-2026-6610) and
[GO-2026-6617](https://pkg.go.dev/vuln/GO-2026-6617). Affected symbols are not
proof of every advisory's runtime exposure. The September scan results below
remain historical evidence, not current clearance.

This source update does not record an activation. Require exact-source CI,
both vulnerability scans, restored-backup/race tests, drained activation and
executable verification before deploying. Any rollback build must retain the
Go/x/net patches as well as gRPC 1.83.2. No charging, model or admission change
is authorized by this dependency patch.

## October 2026 frontend patch gate

The candidate keeps the existing Next minor and wallet framework, pairing
Next/ESLint 16.3.8 with sharp 0.35.5, Axios 1.20.0 and source-map-js 1.2.2.
The Tailwind animation plugin is build-only and moves to devDependencies so
its tooling peers do not survive the production prune. Always build before
`npm ci --omit=dev`, then verify the actual pruned server with `next start`.
No audit suppression or forced wallet/framework upgrade is permitted.

Fresh production audit, unit/lint/build and desktop/mobile browser checks
are required. Package findings alone do not establish runtime exploitability:
both OG routes select Edge, which the Node-only ImageResponse RCE advisory
excludes. This source contract does not record a production activation or
clear unpatched Go dependencies; qualify the backend security patch separately.

## Compiled-backend hardening (2026-09-28, 22:55 UTC)

Production selects `c56d432d93fd1038cbafc976ed68db35b5873d67`, the
tree-identical tested head of PR #41 (`f2a36e6d799fee6f3f03c22fefb4b28282f9f46a`).
This preserves the image rollout below while upgrading gRPC 1.83.1 to 1.83.2
and its required x/net 0.58.0 dependency. CI now scans the compiled executable
in addition to source reachability.

The additional binary scan found [GO-2026-6443](https://pkg.go.dev/vuln/GO-2026-6443)
in the previous linked artifact. Source analysis did not find a reachable call;
the advisory requires an xDS gRPC server, which Gallery does not configure.
This was a hardening finding, not proof of an exposed exploitable endpoint.
The patched source and binary scans both pass; three module-only findings
remain non-reachable and are not claimed fixed.

Required PR CI/CodeQL passed (36494738403/36494738364), including PostgreSQL
race tests and the new compiled-binary gate. The host repeated Node 22 build,
production dependency audit/reinstall, Go race/vet/build and both vulnerability
scans. A fresh checksum-verified backup restored into scratch and passed the
full race suite with existing data/schema unchanged; scratch was removed.

Drained activation completed at `2026-09-28T22:55:13Z`. Both processes and the
running backend digest were verified, with unchanged environment/schema and
normal ingress restored. Backend SHA-256:
`26a36967f60be0f4e536cea86ac51e3e6c3efd415ee83a6cb30b88f8f0ccdb11`.
Protected proof: `/var/lib/aipg-release-proof/gallery-c56d432d/`.
No further generation, credit spend or Core change occurred in this follow-up.

Retained `gallery-29f472d5` predates this dependency patch. Do not treat it as
an unconditional security rollback: build a reviewed rollback retaining gRPC
1.83.2 and pass both scans first. For an image feature incident, close only the
affected Core admission path with a drained restart; never turn charging off.

## Qualified image batches (2026-09-28, 22:38 UTC)

PR #39 merged as `823edfddfacf299c37ab4c398e49f6faac88d68c`.
At that activation, production selected its tree-identical tested head
`29f472d5d09846a253a6692807d7eb1d382c867a` at `gallery-29f472d5`.
Studio offers four-image batches only for online Klein, Krea and Z-image
text-to-image selections. Source uploads hide/reset batching; unsupported or
offline models cannot retain a hidden batch choice. Core still enforces billing,
recipe capabilities and output cardinality independently of the browser.

Verification: 125 Jest tests, all 18 production-build Playwright tests including
four decoded batch images on desktop/mobile, lint with zero errors, PR/main CI
and CodeQL (runs 36493012724/36493012743 and 36493352369/36493352360).
Host Node 22 build, production lockfile reinstall/audit, Go race tests, vet,
vulnerability scan and binary build passed. The scanner found no reachable Go
vulnerabilities; existing lower-severity npm and unreachable Go findings are
not claimed fixed. A checksum-verified production backup restored into scratch
and passed the full race suite with existing records/schema unchanged.

Activation gated submissions, observed an empty active/uncertain job journal
twice, switched both processes, and verified executable identity, unchanged
environment/schema, restored ingress, public Studio 200 and anonymous credits
401. Activation completed at `2026-09-28T22:38:10Z`; backend SHA-256 is
`2178f0aaf973037471d6ab74eabb211ffca646e3430adf999f45c3d93c291e12`.
Protected proof: `/var/lib/aipg-release-proof/gallery-29f472d5/`.
Retain `gallery-0f3d3948` as the independently runnable rollback.

Core separately enabled image-to-image and image-batch at 22:36:36 UTC on
unchanged `ca1f2a12` / Alembic `0042`. Qualification used real Core, PostgreSQL,
Redis, R2 and the owned 5090 with disposable balances: nine success cases,
three refund/no-payout failures, disconnect/recovery, terminal replay, and 61
PostgreSQL billing regressions. See Core's `docs/MEDIA_ONBOARDING_FOLLOWUP.md`
for accounting and production API canaries. These are not a fresh signed-in
Gallery browser submission: that final manual check requires the unlocked
operator browser. Timeline and 3D activation are explicitly out of scope.

## Studio account-history isolation (2026-09-17, 14:07 UTC)

Production selects `0f3d3948f976403d95db196e336a873cb6a0bedf` (PR #37) at
`gallery-0f3d3948`. Live testing with a second Google account found that Studio
merged the previous account's locally cached completions into the new view.
The fix scopes all history/progress/completion paths to the canonical account,
discards stale fetches and late callbacks, and hides history immediately on
account changes. It preserves recovery receipts without relabeling ownership.
This was shared-browser cache disclosure, not proof of arbitrary server access.

All required PR and exact-main checks passed: CI runs 35230602130 and
35231033321, CodeQL runs 35230602025 and 35231033295. Local verification passed
121 Jest tests and all 16 production-build browser tests. Regressions were
observed failing before the fixes. Host Node 22 build, production lockfile
reinstall/audit, Go race tests, vet and vulnerability scan passed. A fresh,
checksum-verified backup restored into scratch passed the full race suite with
existing rows and schema unchanged; scratch was dropped. No migration changed.

Activation gated submissions, observed no active/uncertain jobs twice, switched
both services, and verified the running backend, unchanged environment/schema,
and restored Nginx configuration. Finished at `2026-09-17T14:07:23Z`.
Backend SHA-256:
`3a6ef3a3382af51840a6e818380bc23dbabeae8d52fd9a6ee9399a1951899a56`.
Public Studio returns 200 and anonymous job submission returns 401. The retained
compatible rollback is `gallery-81f9d595`; retention removes the older third
release, not backups or evidence. Protected proof is under
`/var/lib/aipg-release-proof/gallery-0f3d3948/`.

The real second-account session survived reload. Its saved image loaded and
the original account's cached canaries disappeared. Its daily balance remained
USD 0.001 with no new reservation or paid-ledger entry; Core billing reconciled.
Before release, two Music jobs and one Art job consumed the same daily allowance,
and an unaffordable Art submission was rejected without another reservation.
This proves cross-app daily credit accounting and Art rejection/reload behavior,
not a live failed-generation refund. No charging or validator policy changed.

## Studio failure visibility and security patch (2026-09-17, 02:37 UTC)

Production selects `81f9d59535c3aaf87758db5cc427a99a953905b4` (PR #34) at
`gallery-81f9d595`. Studio now shows the latest current-account job's terminal
error next to the prompt, including after reload. Newer jobs supersede older
errors; no other account's error is shown and no paid retry is automatic.

CI caught GO-2026-6348 in the existing gRPC dependency. PR #35 patched it to
v1.83.1 and merged as `30c9181ae477b92817db34ea102a7134e9d2253c`. That
security-only release preserves the old UI and is the retained patched rollback.
Do not roll back to an older vulnerable dependency to undo a UI change.

All required PR and exact-main checks passed, including PostgreSQL 16 backend
race tests, frontend/browser tests, complete-history secret scanning and CodeQL.
Local verification passed 113 Jest tests and all 15 production-build browser
tests. These include credit rejection, terminal failure, balance refresh,
account isolation and reload recovery without another generation POST.

Both candidate and rollback passed Node 22 builds, production-only lockfile
reinstall/audit, Go race tests, vet, vulnerability scanning and binary builds
on the release host. Fresh checksum-verified backups were restored into separate
scratch databases; full candidate race suites preserved all existing row
fingerprints and schema. Both scratch databases were dropped. No migration or
environment change was introduced. The vulnerability gate reports no reachable
Go findings; lower-severity npm and unreachable Go findings are not claimed fixed.

Activation gated new submissions, observed an empty active/uncertain journal
twice, switched both services, and verified process/binary identity plus
unchanged schema, environment and final Nginx configuration. Activation finished
at `2026-09-17T02:37:08Z`. Backend SHA-256:
`bc4a0bd8123de5e8654f2b00e65abd5711eb77909ccf42cb2d9dea4d51572f6c`.
Health and public Studio return 200; anonymous credits/jobs return 401 after the
gate is removed. Private proof is under
`/var/lib/aipg-release-proof/gallery-81f9d595/` and `gallery-30c9181a/`.

A fresh authenticated browser load retained the owner's session, balance and
private creations. The earlier paid LTX receipt still played its saved clip;
Core showed no new job or charge and reconciled all balances. This proves
post-release session/result recovery, not fresh OAuth/SIWE, a live zero-credit
rejection, or a failed-generation refund. Those live cases remain separate
launch evidence. No charging, admission or validator economic policy changed.

## Admission rejection repair (2026-09-10, 14:35 UTC)

Production selects tested head `24a0fbf002d29ffab0982506ae0ef880bdfcc335`
at `gallery-24a0fbf0`. PR #32 merged as
`7c55a429b387e1bc3fed18582dd0b7e867ec77e3`; the two trees are identical.
All required backend, frontend, browser, security and CodeQL checks passed.
The new regression failed on the previous behavior and passes with the fix.
An isolated PostgreSQL 16 run passed the full Go race suite and vet, including
persisted rejection/replay/reload and the real-process crash recovery tests.

Core already rejects disabled generation paths before reservation or dispatch.
Gallery now recognizes that exact bounded JSON 503 admission response as a
terminal rejection. Other 5xx responses and recovery 404s remain uncertain;
no automatic generation retry, recipe fallback or historical journal cleanup
is introduced. This release does not enable Director timelines or change prices.

The host passed the Node 22 production build, lockfile reinstall and production
high/critical dependency audit, plus Go race tests, vet and binary build. A
fresh checksum-verified Gallery backup was restored into disposable scratch;
the full candidate race suite passed there with existing row fingerprints
unchanged, and the scratch database was dropped. No migration changed.

Activation briefly gated submissions, observed no processing/uncertain journal
rows twice, switched both services and verified health, process/binary identity,
anonymous credit rejection and unchanged schema/environment. Original Nginx
configuration was restored. Activation completed at `2026-09-10T14:35:02Z`;
`gallery-af7593fd` is the compatible rollback. Private evidence is under
`/var/lib/aipg-release-proof/gallery-24a0fbf0/`.

A real signed-in Director test reused the already-paid first frame and submitted
one disabled timeline render. Gallery job `67db859a190bb186458b4352422f26dd`
persisted `faulted`, with a visible disabled/no-job/no-charge error instead of
indefinite processing. Reload retained the failed segment, frame receipt and
error without resubmission. Core has zero reservations for that client reference;
the purchased balance stayed USD 9.611518. This proves correct rejection, not
successful timeline rendering. Plain Gallery video and first-frame generation
passed separately in Core's September 10 launch record.

At the September 10 closeout, global charging was on and prospective payouts
had resumed. Batch images and img2img were still closed then; the September 28
qualification above supersedes that admission state. Timelines and 3D stay closed.

## Persisted video playback repair (2026-09-09, 15:11 UTC)

PR #29 merged as `02446c68095ce24cbaa75c17dff73309c312ba03`. Production
selects its tested head `af7593fd262a9d1004a95d053e198a7dca807025` at
`gallery-af7593fd`; the merge tree is identical. Required PR and merged-main
CI passed, including PostgreSQL 16 race tests, frontend/browser checks,
full-history secret scanning and Go/TypeScript CodeQL.

A funded LTX canary completed and settled once, but reloading Studio lost
playback. The database and durable receipt correctly recorded video; the
single-item, private-history and favorite readers hardcoded image. Those
readers now preserve the stored type. No schema, billing, auth, frontend or
generation contract changed, and no saved media rows were rewritten.

The Node 22 build, production lockfile reinstall/audit, Go race suite, vet and
binary build passed on the host. A fresh checksum-verified backup was restored
into disposable scratch; the full candidate Go race suite passed there with
all existing gallery, user, favorite, generation, pending-job and migration
rows unchanged. The scratch database was dropped. Protected proof is under
`/var/lib/aipg-release-proof/gallery-af7593fd/`.

An initial activation wrapper stopped on shell quoting before switching the
application and restored normal ingress. After correcting that wrapper,
submissions were briefly gated and two journal observations found no active
or uncertain image/video jobs. Both services switched and passed health,
binary/process-path, anonymous-401 and unchanged schema/environment checks;
normal ingress was restored. `gallery-c2301476` remains the compatible rollback.

The existing signed-in browser then reloaded the original canary, identified
it as video and opened its player. Successive screenshots showed moving
frames; the original receipt/media URL and balance were retained. The video
was not regenerated. This proves completed-result playback across release and
browser reload, not an in-flight broker crash or a multi-stage Director run.
The modal's requested dimensions differ from the encoded clip dimensions;
requested-versus-actual metadata and visual quality remain separate follow-ups.
Global billing and payout activation remain gated in Core's launch report.

## Durable media recovery (deployed 2026-09-09, 01:49 UTC)

Core PR #149 merged as `bf975599bdfba9fce7b9c661e98331fa3a1aafc1`.
This Gallery candidate depends on its migration 0040 and authenticated
`GET /v1/media/results` endpoint, plus Core PR #150's private
`GET /v1/account/ownership` (merged as
`4891565001ba18ca2bc4b4cfcdb818aeb7da5aeb`). Core is now running that exact
release at Alembic `0040`. Gallery PRs #25/#26/#27 are deployed together as
`c23014761acc14f83030601b5f9bb71311ca6662`, selected through
`/opt/aipg-gallery-current` at `gallery-c2301476`.

Deployment evidence:

- All Gallery PR checks passed: PostgreSQL 16 Go race tests, frontend, browser,
  full-history Gitleaks, and Go/TypeScript CodeQL. The host passed the Node 22
  production build, production-only lockfile reinstall and high/critical
  dependency audit, plus Go race tests, vet and the pinned-toolchain build.
- A fresh local Gallery backup was checksum-verified and restored into a
  disposable database. The candidate's full Go race suite ran against that
  restored database. Existing user, favorite, gallery and generation rows
  matched before/after row-count and content hashes; the first two migration
  checksums were unchanged. Migration 0003 created an empty journal with RLS.
  The scratch database was dropped, and the live schema stayed on two
  migrations throughout the proof.
- New submissions were briefly gated. The old service invocation's journal
  showed zero generation starts and zero terminals; that is an observation,
  not a durable registry or a way to recover pre-release in-memory jobs.
  After switching releases, normal startup applied migration 0003. The live
  first two checksums still match, and the new journal was empty with RLS.
- Both services are active. The running Go executable matches SHA-256
  `7d8ca54b666024d7712249d11c1a66bd2fecce9b60d5d61f00ad81e1d2824601`.
  Environment and final Nginx configuration are unchanged, the temporary gate
  is removed, public Director returns 200, and anonymous credits/recovery
  requests return 401.
- The existing signed-in Google browser session loaded private creations
  after cutover without another login. Nginx recorded successful `/api/auth/me`
  calls after cutover. This is not proof of a wallet-first merge or a funded
  recovery after a generation failure.
- Protected evidence and the fresh backup are retained under
  `/var/lib/aipg-release-proof/gallery-c2301476/`. Retention keeps active
  `c2301476` plus patched rollback `9e7ff3dc`; pruning the older inactive build
  returned free disk space to about 3.6 GB.

Still required before declaring the paid Gallery lifecycle proven: test funded
first-frame and video-stage jobs, then recover their saved handles after a
broker restart. Verify one Core reservation, debit and completion per stage;
replaying an identical request must not generate again. Test live Google/wallet
account-merge recovery as well. No paid generation or credit grant occurred
during this deployment, and global billing/reward gates remain unchanged.

Rollback keeps the new journal and Core reservation/result columns. An older
application cannot recover those new receipts; gate submissions and roll
forward to a repaired reader rather than dropping the journal or retrying jobs.
Recovery does not extend R2 object retention and `closed_without_result` is
not proof of a refund. Do not prune unresolved journal rows.

The client candidate adds browser-persisted pre-submission handles, owner-bound
read-only recovery after a lost 202, and separate Director first-frame/video
associations. A production-build browser test deliberately loses the submission
response, reloads, and recovers the original job with one POST. This is mocked
protocol evidence, not a funded live canary. The account-merge candidate checks
Core ownership before renewing an old session, migrates only proved gallery
owners and browser recovery handles, and reads immutable journal owners through
the same verified family. Reused request IDs across that family return 409;
the original Gallery job ID disambiguates. Core outages preserve the browser's
session markers but fail closed server-side. Test this handoff with live Google
and wallet sessions, plus the funded multistage canary. Deploy the compatible
backend before this frontend; older backend routes cannot recover these handles.
Charging flags and worker payout policy are unchanged by this candidate.

## Earlier patched release (2026-09-08, 23:24 UTC)

- Active commit: `815c11eef601486d83a9c216f63f620bb56d359e` (PR #22).
  Director reload recovery preserves uncertain job identifiers and prevents
  automatic replacement submissions. It does not add durable server-side
  idempotency or prove the paid Director lifecycle.
- Next.js/ESLint `16.3.4` and sharp `0.35.4` pass the production high/critical
  audit gate. Two moderate and one low dependency finding remain.
  Verify sharp with `require("sharp").versions.sharp`; its package exports do
  not permit `require("sharp/package.json")`.
- All PR CI/CodeQL checks passed. The host passed the Node 22 production build,
  frozen production dependency reinstall, Go race tests, vet, and binary build.
  A loopback-only candidate returned 200 for Studio and Director before cutover.
- Both services now run from `gallery-815c11ee`; the Go executable checksum is
  `672a978fbdadb4a8c1c9b3f0c63d4bfd57ea20e625c0e9e9cd747d3e2a195c1e`.
  Shared environment and final Nginx configuration are unchanged. A temporary
  submission gate was removed after the restart and health checks. Anonymous
  credits/jobs return 401; public Studio/Director return 200.
- A fresh browser load restored the signed-in session and existing creation.
  The purchased balance remains approximately `$0.0007`; Krea remains preview
  for this cohort. No new paid canary or global charging activation occurred.
- Host evidence: `/var/lib/aipg-release-proof/gallery-815c11ee/`.
  Core's `deploy/DEMAND_BILLING_LAUNCH_2026_09_08.md` records detailed evidence
  and outstanding cross-site, batch, and Director launch gates.
- The retained earlier releases contain affected image-processing packages.
  Do not blindly restore those dependencies for a UI rollback: preserve these
  patches in a rollback build, or contain the affected surface while repairing
  the patched candidate.

## Earlier billing release (2026-09-08)

- Selected commit: `5836668b91a25cb2a1491af1fca6d8b1fa6d1cb6` (PR #20).
  All PR backend, frontend, browser, security, and CodeQL checks passed.
- The production candidate passed the Node 22 frozen dependency install and
  Next production build, followed by a production-only lockfile reinstall,
  Go race tests, vet, and binary build. No schema migration was introduced.
- Activated `gallery-5836668b`; independently runnable rollback
  `gallery-2bc9c7e6` remains retained. Environment hash was unchanged before
  construction and after activation; service definitions and Nginx were not edited.
- Both processes are active, the backend process directory matches the new
  release, and `/proc/<pid>/exe` matches the candidate binary SHA-256
  `04a9f9d9094de2494ee612387eb74dec4b58cd5a17af6b725b94aab0249b381d`.
  Public `/create` returns 200; anonymous `/api/credits` returns 401.
- A real signed-in Google session survived a fresh page load. The persisted
  private canary image loaded and the Z-Image quote remained paid. Before this
  release, that canary proved one 3,000-micro-USD purchased debit, one settled
  reservation, and one image completion in Core; a second submission showed
  insufficient credits. The backend release adds response-side account matching.
- This is not global billing activation. Krea remains preview-only for the
  inspected cohort, and other modalities and cross-site identity canaries are
  still outstanding. Detailed economic evidence lives in Core's
  `deploy/DEMAND_BILLING_LAUNCH_2026_09_08.md`.

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
npm audit --omit=dev --audit-level=high
npm ci --omit=dev
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
for attempt in $(seq 1 30); do
  curl -fsS http://127.0.0.1:3000/create/director >/dev/null && break
  sleep 1
done
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

Before selecting a prior release, check its dependencies against current
security gates. Do not restore the pre-`815c11ee` affected Next.js/sharp packages.
Prepare a reviewed rollback candidate retaining the security patches when the
previous release is affected. Then point `/opt/aipg-gallery-current` to that
candidate, restart both services, and repeat the smoke checks. Do not roll back
by copying individual files into the active checkout.
