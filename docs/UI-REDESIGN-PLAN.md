# AIPG.art UI Redesign — Execution Plan

Branch: `qa/ui-redesign` (off `qa/gallery-hardening`, i.e. the original UI).
Scope lock: visual only — no functionality, routes, IA, copy meaning, or feature
changes. Full brief: `docs/UI-REDESIGN-BRIEF.md`.

## Locked design decisions

**Accent system (two roles, one rule).**
- `accent/primary` = warm copper-amber. Brand-aligned (the AIPG logo), used for
  ALL primary actions and identity: primary CTAs, Generate, Render, Sign in,
  active nav indicator, focus rings, primary links.
- `accent/processing` = cool electric blue. Reserved STRICTLY for generation /
  render in-progress feedback (progress fills, working pulses, active job).
- Rule: warm = action & brand, cool = working. Nothing else is accent-colored.
- Status/rating badges use quiet desaturated coding (success green, coming-soon
  zinc, mature rose), never the primary accent.

**Typography.**
- Display / headlines: Space Grotesk (600/700), tight tracking.
- Body / UI: Inter (400/500/600) — actually loaded via next/font, not a fallback.
- Numeric / parameters: JetBrains Mono (steps, CFG, dimensions, seed, prices).
- A real scale: display / h1–h4 / body-lg / body / caption / eyebrow, each with
  distinct size + weight + tracking.

**Shape language (kill pill-for-everything).**
- Remove the global `border-radius: 9999px !important` rule in globals.css.
- Nav: text link + underline/dot active indicator (no pill fill).
- Buttons: medium radius (~10px). Chips (aspect/style): small radius (~6px),
  tight. Badges (status): rounded-rect (~4px). Cards: 14–18px, varied surface.

**Surfaces / elevation.** base canvas (near-black warm-tinted, not #000) →
raised panel (bg shift + hairline) → overlay (bg + soft shadow). Not every
container gets a border.

**Motion.** easing `cubic-bezier(0.2,0.8,0.2,1)`; 150/240/400ms; purposeful on
tab switches, hovers, selected-states, generation progress. Respect
`prefers-reduced-motion`.

## Phases (each ends with a screenshot self-review)

- [x] **P1 — Foundation.** Fonts (next/font in layout), globals.css token system
      + utilities (surfaces, eyebrow label, custom range slider, atmosphere,
      grain, motion), tailwind.config fontFamily + processing/status colors,
      remove the pill !important rule. Verify: build compiles, tokens resolve.
- [x] **P2 — Primitives + global nav + background.** Shared Button/Chip/Badge/
      Card/Slider/SearchInput primitives; restyle Header (editorial nav, clear
      CTA hierarchy); restrained page atmosphere in layout.
- [x] **P3 — Marketing surfaces.** Join (asymmetric hero + live gallery preview,
      weighted sign-in options, real status badges) and Login (fix duplicate
      WalletConnect, real wallet option list with icons, atmosphere). One shared
      auth surface look.
- [x] **P4 — Gallery.** Grid gutters + aspect-respecting masonry; connected
      search+filter control; chip filters with real selected-state; tile hover
      metadata overlay.
- [x] **P5 — Studio.** Prompt hero; primary/secondary action split; sidebar as
      real settings panel with model cards + radio/check; custom sliders;
      creations grids match gallery tiles.
- [x] **P6 — Director.** NLE/timeline aesthetic; grouped top-bar controls;
      accent reconciled (Render = primary amber, progress = processing blue).
- [x] **P7 — Consistency sweep.** Walk the Section 5 checklist page by page;
      final screenshots; tests (go + jest + tsc) green.

## Verification loop (every phase)
1. `npx tsc --noEmit` (app clean) + `npx jest` (78 green).
2. Start dev, screenshot the touched pages at 1280px (and 390px for key ones).
3. Critique against the brief's "tells to eliminate"; fix; re-shoot.
4. Commit the phase as a focused commit (<600 lines) on `qa/ui-redesign`.
