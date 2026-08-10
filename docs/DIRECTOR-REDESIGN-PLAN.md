# Director Redesign Plan

Goal: make the Director read like the rest of the (now-good) site, cut the wall
of text, and drop the remaining "AI-explainer" feel — without changing any
functionality (every control, toggle, and handler stays).

Files: `components/create/director/{director-console,console-timeline,segment-inspector,render-settings-panel,preview-stage,coach-tip}.tsx`.

## Problem (what makes it feel AI / text-heavy today)
1. It hardcodes ~12 hex constants (`#17171b`, `#242429`, `#313138`, `#8f8f99`,
   `#5a5a64`, `#e9e9ec`, `#e2892a`…) instead of the shared tokens, so it doesn't
   use the site's button/chip/badge vocabulary — it just *happens* to look close.
2. Every field has a label **above** it ("Segment prompt", "Negative — this
   segment", "Length (s) 1–N", "Global prompt", "Negative prompt", "Seed") — each
   claiming its own line of vertical space.
3. Hand-holding "coach tip" boxes ("Required: Generate the first frame…",
   "Ready: Render this segment…") and full-sentence blocker/empty-state copy
   ("Rendered segments play here as one cut" / "Render a segment from the timeline
   below to start") take real estate and read as templated.

## Changes

### 1. Labels → placeholders (reclaim the space)
Remove the standalone `<label>` above each input and move the wording into the
field itself as muted placeholder text:
- Segment prompt → `placeholder="Describe this segment…"`
- Negative → `placeholder="Negative prompt (optional)"`
- Global prompt / Negative (ALL SEGMENTS panel) → same treatment
- Seed → `placeholder="Random"`
- Length → drop the "Length (s) 1–N" label; keep a small `s` suffix + the −/+ steppers; range lives in the tooltip/title
- Image strength → keep the inline value readout only (no separate label line)
Net: the inspector loses ~7 label rows and gets noticeably denser.

### 2. Trim the explainer copy
- Empty preview: two lines → one — "Render a segment to preview the cut."
- Section explainer "shared prompt & settings" → drop; the `ALL SEGMENTS` badge is enough.
- Blocker sentences ("This segment needs …") → a short inline cue on the Render button's tooltip + a small dot, not a paragraph.

### 3. Replace coach tips with a quiet cue
- Retire the boxed `CoachTip` (Start here / Required / Ready). Replace with a
  subtle ring on the one field that needs attention (the pattern the studio
  already uses for focus) — guidance without a paragraph. Keep a single first-run
  one-liner at the top of an empty project only.

### 4. Adopt the shared design system (token migration)
Map the hardcoded hexes to tokens/utilities so the Director is literally the
same system as Studio:
- `#e2892a` → `primary` · `#34d399` → `success` · `#f87171` → `destructive`
- `#121215` → `bg-background` · `#17171b`/`#1c1c22` → `bg-card` · `#242429` → `bg-secondary`/`border-border`
- `#313138` → `border-border` · `#4a4a53` → `border-edge` · `#8f8f99` → `text-muted-foreground` · `#5a5a64` → `text-tertiary` · `#e9e9ec` → `text-foreground`
- Buttons → `btn btn-primary` / `btn btn-secondary` / `btn btn-outline btn-sm`
- The "Segment N" chip and status → `.badge` tones; section headers → `.eyebrow`
- Panels → `surface-raised`; numeric readouts (length, strength, seed, timecodes) → `.numeric`

### 5. Top bar grouping (director-console)
Group the top bar into three clusters with hairline separators: **left** (← Studio · Director · Project), **center** (Total · N/N rendered), **right** (Sign in · Render · Export) — Render = `btn btn-primary`, Export = `btn btn-outline`, using the shared vocabulary instead of three ad-hoc button styles.

## Verification
`tsc` clean · `jest` 78 green · before/after screenshots of `/create/director`
(empty + with a segment selected) · confirm no control or handler changed.

## Rough size
~4 focused commits (inspector, global panel + preview, timeline, top bar), each
< 300 lines, all on `qa/ui-redesign`.
