# Studio Video Production Deployment

## Release

- Operator approval: Justin / halfaipg, explicit deployment request.
- Target: production `aipg.art`, Gallery API and Next.js services.
- PR: [#50](https://github.com/AIPowerGrid/aipg-art-gallery/pull/50).
- Selected source: `b9cc4378dd823c0847ef6a39367ac8bdf75c2700`.
- Tested PR head: `bfe2e746a57d7b31902b65f227911fb95553bafe`.
- Identical complete tree: `099f8fd6c6701e032ee84ae85f8f65a64c2cd697`.
- Activation: `2026-10-16T03:44:47Z` to `2026-10-16T03:44:54Z`.
- Runtime: host Node22.23.2, CI Node22.23.3, compiled Go1.26.9.
- Configuration schema: unchanged; no new environment variables or settings.
- Database revision: existing Gallery migrations0001, 0002 and0003;
  recorded checksums unchanged. No production schema migration ran.

Studio now presents Image and Video as modes of the same creative workspace.
Video uses the existing durable LTX-2.5 broker, exact quote and owner-bound
recovery hooks. Director retains existing projects and assembles clips under
the shared Gallery header; its Create clip action returns to Studio Video.
The obsolete image-side video catalog and legacy continuation action no longer
direct users to an unrendered workflow.

## Provenance And Checks

Protected-main [CI38845669930](https://github.com/AIPowerGrid/aipg-art-gallery/actions/runs/38845669930)
and [CodeQL38845669842](https://github.com/AIPowerGrid/aipg-art-gallery/actions/runs/38845669842)
passed for the exact selected commit. The tested PR and main trees match.
Four independently verified GitHub attestations bind the ciphertext,
release manifest and frontend/backend SBOMs to the main workflow, main ref,
source digest and hosted runner. A PR artifact was not deployed.

- Encrypted artifact SHA256:
  `2fc1bd1638943e83da2d4f66bb74a2ebc9bd8dfed9629890bdeeeaff012719b8`.
- Plain archive SHA256, verified only on the deployment host:
  `25347a2ea0a7a0d6e0c5d337ab496930089679b2fd06d87fa71de2fd80a70429`.
- Running backend SHA256:
  `c9e494d8ca7eb1e6b8198214403c20d93b20f48363d33c9d940ec5271247422c`.
- Running frontend BUILD_ID file SHA256:
  `2fcf462a34da7172a772d53e3c3073c4e1e43da67db6abae08483a0b3df0fae2`.

The immutable bundle contains82369 committed runtime/source commitments.
Extraction checked complete hashes and safe paths into an inactive stage,
with the required free-space margin. The decryption key never left the host.
Unit verification passed226 tests; all29 production-build browser tests
passed, including four widths, draft retention, account isolation, lost-response
recovery, fixture playback/seeking and assembly import without a new dispatch.
Lint had zero errors. The production audit had zero high/critical findings;
five pre-existing moderate findings remain. CI source, binary, container,
history-secret and CodeQL gates passed; this is not a claim of no residual risk.

A fresh560407-byte database backup was restored into a disposable private
database. Its SHA256 was
`93336d016d96c303ceb8003498b4ea3e87ce81f2ef45166d4b65a3a3c373127b`.
All seven same-source standalone race-test packages passed under the service
restrictions, with no skipped tests and no live application credentials.
Existing rows in all six restored tables and their schema fingerprints were
unchanged. The scratch database, role and temporary credentials were removed.
The exact backend, actual pruned npm tree, production audit and inactive Next
startup/routes also passed on the deployment host.

## Cutover And Live Verification

New image/video generation POSTs were briefly guarded at both origin and
public ingress. Accepted jobs drained; two quiet journal snapshots matched.
A final verified backup preceded stopping the services and atomically selecting
the new release. Final backup SHA256:
`f78245ac1a6b8f7bdffff30d6e963b41affd260ffea8c4442e9acd9640f334d5`.

Both services started from the exact selected release with zero automatic
restarts. The running executable and frontend build commitments matched the
verified manifest. Normal ingress was restored. Protected environment file,
API configuration, public auth/build profile, service/Nginx wiring, retention
timer and migration checksums remained unchanged.

The web process additionally inherited `GALLERY_DURABLE_VIDEO_NVFP4_ENABLED`
on restart. Its prior process lacked that key, but the value was already in
the unchanged environment file and running API before this deployment. Next
does not consume this Go-only flag. This sole process-environment difference
was checked against the API's baseline and recorded, not silently waived;
all other web configuration matched.

Public Studio Video and Director returned200. Anonymous credits, video
capabilities and receipt lookup returned401. Retired music routes returned404.
The existing signed-in browser session survived reload, recovered a previously
completed clip, decoded it without a media error, displayed both online video
model variants and the existing quote/balance, and navigated Director to
Create clip and back. A390px live layout had no horizontal overflow; its
temporary viewport override was reset. No generation POST, paid canary,
wallet action or new credit spend was performed during this rollout.

## Unchanged Boundaries And Rollback

No Core deployment, auth redesign, charging/tariff change, payout change,
frame-limit increase, source-admission change or timeline-generation activation
was part of this release. Existing BF16/NVFP4 settings were preserved, not
newly qualified by the UI or read-only clip recovery.

The compatible rollback remains `gallery-bac2dd5d`, exact source
`bac2dd5d839c582279cb7c704aacef23f41aad48`, with its verified runtime/restore
proof and patched receipt readers retained. Normal active-aware retention
removed only the older inactive `cf533e97` before staging, preserving the
then-active `bac2dd5d` and its rollback. Private backups/proofs were untouched.
The active-aware timer remains enabled; never prune the selected release or
its verified compatible rollback. A rollback requires guarded/drained service
selection, preserved receipt recovery and a new deployment record, not a
database restore or a downgrade of the security patches.

Detailed host evidence is root-only under
`/var/lib/aipg-release-proof/gallery-b9cc4378/`. No account identifiers,
application credentials, source uploads or private logs belong in Git.
