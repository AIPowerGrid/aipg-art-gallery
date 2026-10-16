# Unified Director Source Rollout

This is an implementation and acceptance checklist, not production activation.
Current public production remains BF16 text/opening-image video. Source audio,
source video, timeline generation, appearance references and video x402 are
separate gates. Never substitute an opening portrait for an identity reference.

## Implemented Candidate

- One Studio Video workspace (`/create?type=video`), independent of sign-in and
  delayed capabilities, with the same header/account controls as images.
- Text, Audio and Video modes with relevant source controls and preview.
- Exact clip lengths, source start time and optional explicit first frame.
- Visible model/clip-length/resolution controls; raw frames and sampling under Advanced.
- Ephemeral source preparation through the authenticated Go broker.
- Exact stereo48k PCM16 soundtrack window; no short-source padding.
- Motion normalization to H.264/24fps, contain fitting and64-aligned geometry.
- Separate disabled/pilot/open source admission, independent of public text.
- Single durable paid-intent POST after preparation; GET-only recovery.
- Owner changes/cancellation prevent late preparation from dispatching.
- Original terminal receipt clears its stale unknown-submit notice.
- Director opens directly into assembly, keeps legacy projects and forbids all
  legacy render hooks. Its Create clip action returns to Studio Video.
- Explicit finished-clip import, duplicate and reorder do not create jobs.
- Independent in-memory image/video drafts survive mode switching; technical
  receipt IDs are available under details, not the primary result presentation.

## Acceptance Still Required

1. Pass exact-head frontend, backend, security and browser CI. Local codec
   tests are not Linux sandbox qualification or native worker acceptance.
2. Verify the actual Linux codec sandbox rejects host-file/environment access
   and uses a distinct network namespace; verify it under service restrictions.
3. Add and qualify Core's independent source-account cohort and decoder
   isolation. Do not globally enable source paths first and call that private.
4. Verify live worker source recipes/capabilities and permitted workload limits.
5. Verify outer proxy bounds, host tool security, free disk, backup restore,
   retained video-aware rollback and original receipt readers.
6. Deploy immutable reviewed source with source modes still closed.
7. Run separately approved bounded funded A2V and V2V jobs, one each; no paid
   replacement jobs or automatic POST retries. Record actual charge, native
   source commitments, decoded output and original soundtrack alignment.
8. Verify failure/replay/account-isolation and private-input cleanup with
   evidence appropriate to each claim. A completed clip does not prove refund
   handling, input deletion, lip sync or model fidelity.
9. Open only qualified source modes after canaries; retain per-account async
   concurrency and all quote/hold gates. Closing source admission must preserve
   existing read-only recovery and public text video.
10. Review desktop/mobile results, update release records and operator docs,
    and reconcile every original objective before declaring the goal complete.

## Operational Bounds

Uploads are local files up to64MiB, never arbitrary URLs. Preparation admits two
concurrent uploads, checks exact geometry/frames/start, bounds parsing/tool
output, removes private temporary files and creates no quota, hold or job.
Linux uses bubblewrap and prlimit with a cleared environment, isolated network,
limited filesystem and CPU/address-space/file/descriptor limits. Missing or
nonworking isolation refuses source-enabled startup. macOS codec tests do not
waive that requirement. Keep source bodies out of request logs, durable job
journals and browser storage.

On Ubuntu with restricted unprivileged user namespaces, installing Bubblewrap
alone may fail before decoding (`loopback: Failed RTM_NEWADDR`). CI installs
`apparmor-profiles` and explicitly loads its distribution
`bwrap-userns-restrict` policy. That policy grants Bubblewrap namespace setup
while denying capabilities to its children; it is not a globally disabled
restriction or an unconfined custom exception. Production needs the same
reviewed policy and an actual service-user isolation test before activation.
See [Ubuntu's namespace restriction guidance](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007).

The source soundtrack is retained after normalization; that is not a guarantee
of matching generated mouth motion, identity or the original scene exactly.
