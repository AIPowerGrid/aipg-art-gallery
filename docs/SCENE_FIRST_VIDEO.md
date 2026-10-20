# Scene-First Video

## Scope

Candidate Studio flow, not a production deployment record:

The reference/shot section is expanded initially in text/audio video modes,
including signed out. It is distinct from the existing optional First frame
upload, which directly constrains frame zero. The scene stage is not available
in video-to-video mode; character-replacement research remains parked.

1. Upload an optional character/image reference and describe the desired scene.
2. Explicitly select a live image model and compose one private shot image.
3. Review the center-cropped preview at the selected video geometry.
4. Select that shot as the opening frame.
5. Separately generate the clip, optionally with a supplied soundtrack.

Image and video have separate quotes and explicit paid actions. Completion or
selection of an image never starts animation. Users may still upload an already
composed opening image or generate ordinary text video without this stage.
A newly completed shot blocks animation until selected or explicitly cleared;
clearing its local preview neither deletes the image nor cancels/refunds a job.
Basic existing source-video behavior is unchanged; character-replacement V2V
research is parked. Music generation remains on the separate music product.

## Model Boundary

The image stage defaults to `MOSS Image SFT BF16`, using the operational model
catalog's online status and source-image capability. Selection never silently
falls back. The image model supplies its own defaults and legal dimensions.
MOSS uses 50 steps, CFG 3, Euler and the simple scheduler, not Klein's fast
sampling schedule. This default is scoped to video shot composition, not the
standalone Studio Image model default.
Landscape/portrait/square composition uses explicit 1024x576/576x1024/1024x1024
image sizes. The user sees the final center crop before selecting it for video.
This is reference-guided image editing, not guaranteed identity replacement.

Earlier private native comparisons used MSR-conditioned LTX to generate a
scene and ordinary LTX A2V to animate its first frame. They support the staged
architecture, but do not prove that MOSS produces the same reference fidelity.
MOSS source-guided img2img is likewise not an identity-editor certification.
Do not describe image capability metadata, a passing browser fixture, source
sound preservation or a similar sampled face as measured identity/lip-sync proof.

No new MSR/Ingredients Grid model, custom client graph, pricing, worker capability
or public video-reference parameter is added by this frontend integration.

## Billing And Recovery

The shot quote must bind the signed-in canonical account, exact image model,
image modality, one output, charging enabled and a positive safe integer cost.
The browser saves its normal owner-bound request handle before one
`POST /api/images/jobs`. That dedicated route rejects absent IDs/ceilings,
multiple/public images and unrelated controls. Older brokers return a missing
route rather than ignoring a new field on their uncapped legacy API.

Before dispatch, Gallery rechecks the delegated quote and Core's bounded public
health feature `image-max-cost-micro-usd-v1`. It forwards `max_cost_micro_usd`
so a later price change cannot bypass Core's atomic hold ceiling. The existing
PostgreSQL journal and owner-bound GET recovery are shared, not reimplemented.
Definite pre-dispatch rejection permits a later explicit new action; uncertain
transport keeps the original request and never automatically retries/falls back.
An unsuccessful private-library write does not repeat a generation.

The video stage retains its existing exact-frame quote, ceiling, durable job
protocol and prepared-source checks. Refresh its quote/balance after image work.
No automatic combined purchase, shared refund assumption or new credit grant.

## Privacy

References, normalized audio, opening images and crop previews remain ephemeral.
The persisted journal has only existing owner-bound display/recovery metadata,
not uploaded media or request bodies. Completed images remain private library
items and manual recent-image choices; another account's jobs are hidden.
Changing accounts invalidates late file, quote, crop and submission callbacks.

The scene crop fetch uses the same-origin download proxy's explicit `image=1`
mode: HTTPS on the CDN allowlist, no credentials/nonstandard ports/redirects,
PNG/JPEG/WebP MIME only, a streamed10MiB ceiling and30-second deadline. Responses
are no-store/nosniff; exceptions do not print private URLs. Actual browser decode
and crop must succeed before the scene can become an opening frame.

## Release Gates

- Full frontend/backend tests, strict TypeScript, lint, Go race/vet/build,
  production build, dependency/secret/build-privacy checks.
- Desktop/mobile generation, explicit selection, reload recovery, ownership,
  privacy and layout checks against the production build.
- A separately approved real reference-guided image plus short LTX clip with
  acceptable scene/appearance, original source audio where supplied, attributable
  native outputs, exact costs, one charge per stage and unchanged recovery.
- Reviewed PR and exact-commit CI/provenance plus the existing production
  deployment/restore runbook before activation. No rollout is implied by local
  browser success; do not reuse exhausted canary spending approvals.

Rollback must preserve active job/status recovery. New cached clients never
fall back from `/images/jobs` to uncapped `/jobs` if an older server is selected.
No database migration or destructive cleanup is required for this candidate.

## Local Verification - 2026-10-20

On branch `feat/reference-scene-video`, based on `c972bfa`:

- Lockfile-clean install: Node 22.23.2, Next/ESLint config 16.3.8 and sharp
  0.35.5. An older local install was detected and replaced before the final
  frontend checks. 322 Jest tests across 31 suites and strict TypeScript pass.
- Production-build Chromium: 20 durable Director cases pass, including 1280px
  and 390px scene composition, explicit selection, separate image/video posts,
  reload recovery and no uploaded media in browser storage.
- Go 1.26.9: full race suite, vet and build pass. These local results do not
  substitute for Linux codec-isolation or real-PostgreSQL release checks.
- ESLint exits 0 with 132 existing warnings; production dependency audit has no
  high/critical findings and 5 moderate findings. Go vulnerability reachability
  reports no reachable/imported-package findings; one required-module finding
  remains outside the exercised call graph.
- Build-privacy scan checks 208 public outputs; all 9 scanner regression tests
  pass. Source secret scans and whitespace checks pass.

Browser output uses fixtures, not generated character-fidelity evidence. No
production deployment, funded canary, worker restart or release acceptance is
implied by these results. The separately requested image-and-clip canary and
reviewed exact-commit release checks remain outstanding.

Read-only live discovery confirms Core `0d2ee0b7` advertises
`image-max-cost-micro-usd-v1` and MOSS/BF16 capacity. MOSS advertises text-to-image
and source-guided img2img with one online worker. This establishes contract
availability, not successful paid generation or character-fidelity acceptance.
