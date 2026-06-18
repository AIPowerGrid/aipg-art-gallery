# components — React UI components

## Purpose

The shared React UI for the gallery app: layout, the create/generation flow, gallery cards
and modals, wallet/auth controls, and providers.

## Ownership

- Top-level pieces: `header.tsx`, `providers.tsx` (wagmi/RainbowKit/query/theme providers),
  `auth-modal.tsx`, `social-auth.tsx`, `custom-connect-button.tsx`, `wallet-button.tsx`,
  `network-selector.tsx`, `error-boundary.tsx`.
- Gallery: `media-card.tsx`, `creation-card.tsx`, `image-modal.tsx`, `gallery-filter.tsx`,
  `active-jobs-indicator.tsx`, `dimension-slider.tsx`.
- `create/` — the generation flow: `prompt-form.tsx`, `settings-panel.tsx`,
  `creations-grid.tsx`, `anon-limit-banner.tsx` (barrel-exported via `index.ts`).
- shadcn is configured (`components.json`, base color slate) and Radix primitives are
  installed as deps, but components currently use Radix directly — there is no
  `components/ui/` directory yet.

## Local Contracts

- Components are presentational + interaction; data and side effects come from `lib/` hooks
  and stores, and from `lib/api.ts` — components do not call the Go API directly.
- Build on Radix primitives and Tailwind tokens (see `tailwind.config.ts`); do not add
  ad-hoc UI libraries. If you add shadcn-generated primitives, put them under
  `components/ui/` (the `components.json` alias) and update this doc.

## Work Guidance

—

## Verification

—

## Child DOX Index

- None — leaf.
