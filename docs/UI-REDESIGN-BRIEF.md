# AIPG.art — Complete UI Redesign Prompt

**Scope lock:** Visual/UI redesign only. Do NOT change functionality, information architecture, copy/microcopy meaning, routes, page structure, or the underlying feature set (models, sliders, filters, wallet options, etc. all stay — only *how they look and feel* changes).

---

## 1. Design Direction & References

Move AIPG away from generic "AI SaaS template" territory and toward the visual language of **Linear, Vercel, Stripe, and Anthropic's own site** — the benchmark dark-mode product sites of 2026 — while pulling craft/interaction cues from **Runway, Krea.ai, and Midjourney's web app**, since those are the closest functional siblings (prompt box + model picker + generation surface).

Specifically borrow:
- **Linear** → restraint and calibration: every spacing value, weight, and radius feels chosen, not defaulted. Dark-first, not dark-as-inverted-light.
- **Vercel** → confident near-black canvas with *subtle* shader/gradient texture used sparingly (not on every panel), sharp technical typography.
- **Stripe** → motion with purpose (tabbed content that switches with intent, not decorative fades), and treating the marketing/onboarding pages (Join/Login) as real product surfaces, not a lonely centered card in a void.
- **Anthropic.com** → restrained, "paper-like" seriousness — proof that a dark AI product doesn't need neon-on-black to feel premium.
- **Runway / Krea** → domain-specific craft for the actual generation UI: how model pickers, parameter sliders, and output grids should feel tactile and considered, since this is the part of AIPG most unlike a generic SaaS marketing site.

The result should feel like **one deliberate design system**, not a component library's default theme with a logo swapped in.

---

## 2. Explicit "AI-Generated Look" Tells to Eliminate

These are now well-documented, catalogued patterns (2026 design-slop audits) — treat every one as a hard constraint, not a suggestion:

1. **Single default accent color.** AIPG currently leans on indigo/violet (`#6366F1`-ish) for the primary CTA *and* separately uses amber/orange for headings and the Render button, with no system tying them together. Pick **one deliberate accent** (or a clearly justified two-color system with defined roles — e.g., one for primary actions, one strictly for "generation in progress / rendering" states) and apply it consistently. Do not default to Tailwind's stock indigo-500/violet-500.
2. **Inter-and-nothing-else typography.** Introduce real hierarchy: a distinct display/headline face (or a heavier, tighter-tracked cut of the body face used *only* for headings) paired with a workhorse UI font for body/labels. Avoid Inter as the sole, unstyled choice — if you keep Inter for UI text, pair it with something with more character for display sizes (or use variable-weight/optical-size settings deliberately).
3. **Pill-button-for-everything.** Right now nav items, aspect-ratio options, style tags, and badges are *all* the same fully-rounded pill shape. Differentiate by function: nav = understated text links with an underline/indicator, not a pill; selectable option chips = smaller radius, tighter padding, clear selected-state (fill + subtle glow or check, not just a color swap); status badges = distinct shape (small rounded-rect, not full pill) so the eye can tell "this is a tag" from "this is a button."
4. **Thin 1px gray border on every card, uniform radius everywhere.** Vary surface treatment intentionally: some panels get a hairline border, some get elevation via subtle shadow/background-shift only, some get no border at all and rely on spacing to separate. Don't apply the same `border + rounded-xl` to every container reflexively.
5. **Flat, texture-less black void on marketing surfaces.** The Join and Login pages are currently just a centered card floating on pure black — the single clearest "AI-generated landing page" tell. Give these pages actual atmosphere: a restrained gradient mesh or grain texture, ambient light source behind the card, or a subtle animated backdrop (Stripe/Vercel-style, kept slow and quiet) — not neon glow, not a floating 3D blob.
6. **Default browser-style sliders.** The Steps/CFG/Duration/Width/Height sliders are thin flat tracks with plain circle thumbs — visibly unstyled. Redesign as a proper custom component: thicker track, filled portion in the accent color, a thumb with weight (subtle shadow, maybe a numeric tooltip on drag), clear min/max labels styled as captions not raw text.
7. **Weak, same-weight typographic hierarchy throughout.** Section labels ("MODEL", "ASPECT RATIO", "STYLE", "SAMPLING") currently read at nearly the same visual weight as their content. Make eyebrow/section labels smaller, wider-tracked, and lower-contrast (a true label style), and make the values/content clearly the primary reading layer.
8. **Generic centered-hero-with-vague-headline pattern on Join.** "Unlock Unlimited Access" is fine copy-wise, but the layout (giant centered headline, subtext, three equal-weight buttons, done) is the exact template AI tools default to. Give it asymmetry, a supporting visual (e.g., a live/animated preview of the gallery or a generation happening), and differentiate the three sign-in options by weight instead of three visually-equal buttons in a row (primary should look primary).
9. **No micro-interaction personality.** Hover/active/focus states across the board should be intentional — not just an opacity dip. Buttons should ease, not snap; selected states should feel confirmed (slight scale, accent glow, or icon check) rather than a flat color change.

---

## 3. Foundational System

### Color
- Define a real token system: `background/base`, `background/raised`, `background/overlay`, `border/subtle`, `border/strong`, `accent/primary`, `accent/primary-hover`, `text/primary`, `text/secondary`, `text/tertiary`, `status/success`, `status/warning` (for render/processing states), `status/danger`.
- Base should not be pure `#000000` — use a near-black with a very slight warm or cool tint (Linear/Vercel both do this) so the UI doesn't feel like an unstyled `bg-black`.
- Pick the accent deliberately — something that isn't the stock indigo. Consider something that ties to the "power grid" brand concept (electric, energy-adjacent) without going neon-cyberpunk: think a controlled amber/copper *or* a deep electric blue with restraint, used sparingly, not painted across every interactive element.
- Content-rating and status badges (Safe/Mature, Available Now/Coming Soon) get their own quiet, desaturated color coding — not the primary accent.

### Typography
- Establish a clear type scale (e.g., display, h1–h4, body-lg, body, caption, label/eyebrow) with real size *and* weight *and* tracking differences between levels — not just font-size changes.
- Headlines (Join page, empty states, "Sign In") get a typeface or weight with actual presence — this is where AIPG currently feels most templated.
- Numeric/parameter values (steps, CFG, dimensions) can use a monospace or tabular-figure treatment for that "technical instrument" feel Vercel/Linear lean on — reinforces that this is a serious creative tool, not a toy.

### Spacing & Grid
- Adopt a consistent spacing scale and apply it with intent — tighter rhythm inside dense panels (Studio sidebar), more generous rhythm on marketing surfaces (Join/Login).
- Fix the gallery grid: introduce real gutters between images (currently near-zero gap, edge-to-edge) and consider a masonry layout that respects each image's actual aspect ratio rather than cropping into uniform tiles — this is a portfolio/gallery product, the grid should feel curated, not like a spreadsheet.

### Elevation & Depth
- Replace flat single-layer surfaces with a deliberate depth system: base canvas → raised panel → floating/overlay (modals, dropdowns) each with distinct but subtle treatment (background shift + optional soft shadow), so panels like the Studio right sidebar feel like they're sitting *on* the canvas, not just outlined.

### Motion
- Purposeful, not decorative: panel/tab switches (Basic↔Advanced, Image↔Video) should transition with a quick, eased cross-fade or slide — not an abrupt swap.
- Generation states (Render button, "0/2 rendered") deserve real progress feedback design — a subtle animated fill or pulse tied to the accent color — this is a natural, non-gimmicky place for motion given the product's actual function.
- Respect `prefers-reduced-motion`.

---

## 4. Page-by-Page Direction

### Global Nav (all pages)
- Replace the pill-style active nav item with a more editorial treatment: text links with a thin underline or dot indicator for the active route, generous letter-spacing, no background fill on hover — just a color shift.
- Logo mark can stay, but give the wordmark a cleaner pairing with the new type system.
- Resolve the competing CTAs: "Sign in" (text) + "Connect Wallet" (filled button) currently read as equal-ish weight in a busy top-right corner. Make the hierarchy unambiguous — one clear primary action, the other visibly secondary (ghost/outline or plain text).

### Gallery (`/`)
- Rebuild the grid with real gutters and aspect-ratio-respecting layout (masonry, not forced-crop tiles).
- Restyle the search bar: currently a generic full-width dark pill. Give it a more considered treatment — perhaps inline with the filter icon as a single connected control, with a refined focus state (accent-colored ring, not default browser outline).
- Filters panel (Media Type / Content Rating / Aspect Ratio / Models): convert the current pill checkboxes into a cleaner, denser control style — grouped chips with a real selected-state treatment (filled + checkmark or icon, not just color swap).
- On hover, gallery tiles should reveal metadata (model used, quick actions) with a smooth overlay — an easy, high-value place to add the "considered micro-interaction" layer that's currently entirely absent.

### Studio / Create (`/create`)
- The prompt textarea is the hero element of this page — give it more visual weight: larger type, a more refined focus state, and better visual separation from the "Source" image-attach affordance (currently a small floating circle in the corner, easy to miss).
- Differentiate the two action buttons clearly: "Enhance my Prompt with AI" should read as a secondary/utility action (ghost, icon-led), "Generate with [Model]" as the unmistakable primary CTA — right now they read as near-equal weight gray buttons.
- Right sidebar (Model list, Aspect Ratio, Style, Sampling, Add-ons): rebuild as a proper settings panel with clear section separation (not just an eyebrow label + list), model list items styled as real selectable cards (not plain text rows) showing which is active with more than a color fill — add a check/radio indicator.
- Redesign all sliders per the token/motion system above (Section 2, point 6).
- "Latest creation" / "My creations" and "Recent creations" grids should match the Gallery's new tile treatment for visual consistency across the product.

### Director (`/create/director`)
- This is the most "professional tool" surface in the product (timeline, segments, render queue) — lean into that: darker, denser, more technical. Think a proper NLE/timeline aesthetic (closer to Runway's or a video editor's timeline) rather than reusing the same light-touch panel style as Studio.
- Timeline segments, zoom control, and the render/export buttons in the top bar need clearer visual grouping — right now they're a loose row of disparate control styles (text button, colored button, icon button) with no shared system.
- The amber "Render" button and the accent color used elsewhere should be reconciled — decide if amber is reserved specifically for "active render/processing" actions across the whole product, and apply that rule consistently rather than it appearing arbitrary here and orange-branded "Sign In" elsewhere.

### Join (`/join`)
- Break the centered-void template: add a supporting visual — a live/animated glimpse of the gallery grid or a generation-in-progress moment behind or beside the headline, giving the page a product-forward feel (Stripe/Linear treat their landing sections as product demos, not empty hero text).
- Differentiate the three entry buttons by actual priority: "Continue with Google" as the clear primary path (it currently already looks most prominent — keep that), "Connect Wallet Now" secondary, "Try as Guest" tertiary/text-only — right now they're close to equal visual weight in a row.
- Model availability cards below ("Krea 2 Turbo," "FLUX.2 Klein," etc.) should get more distinct card styling — status badges ("Available Now" / "Coming Soon") need a real color-coded treatment instead of a plain gray pill indistinguishable from any other tag on the site.

### Login (`/auth/login`)
- **Fix the duplicated "Connect with WalletConnect" buttons** (it currently appears three separate times in the list) — this is a visual/content-hygiene issue worth flagging even within UI-only scope, since it undermines the redesign's credibility.
- Restyle the wallet list from a stack of identical full-width gray buttons into a real option list — each wallet gets its icon consistently sized and positioned (Phantom currently has one, most others don't), consistent hover/active states, and tighter, more considered spacing so eight near-identical buttons don't read as a wall of gray.
- Same atmosphere fix as Join: this page is currently the starkest black-void-with-centered-card example on the whole site — bring in the same restrained background treatment used on Join for visual consistency and to kill the "generic AI auth page" feel.
- The amber "Sign In" heading should follow whatever the finalized accent-color rule ends up being (see Director note above) rather than being a one-off color choice.

---

## 5. Consistency Checklist (apply across every page)

- [ ] One accent-color system with clearly defined roles, applied consistently (no orange-here, indigo-there)
- [ ] Real type scale with headline/body pairing, not Inter-only
- [ ] Buttons/chips/badges each get their own shape language — not all full pills
- [ ] Custom-styled sliders and form controls, no default browser styling
- [ ] Gallery-style grids (home, creations, recent) share one tile/hover treatment
- [ ] Marketing surfaces (Join, Login) get atmosphere/texture, not a void
- [ ] Motion is purposeful and consistent (easing curve, duration) across tab switches, hovers, and generation states
- [ ] Fix duplicate WalletConnect buttons on Login
- [ ] Nav active-state uses an indicator/underline system, not a pill fill
