# components — React UI components

## Purpose

Reusable client UI for the gallery, generation flow, wallet/Google auth, and
layout. Presentation and interaction only; data and auth logic come from `lib/`.

## Ownership

- Auth UI: `account-control.tsx`, `wallet-auth-button.tsx`, `auth-modal.tsx`,
  `social-auth.tsx`, and `google-one-tap.tsx`. Google buttons and One Tap share
  one page-wide GSI initialization. `providers.tsx` wires Wagmi / RainbowKit /
  React Query and reconciles the cookie session on mount; it must never initiate
  wallet connection, network switching, or SIWE.
- Gallery/media: `creation-card.tsx`, `media-card.tsx`, `image-modal.tsx`, `gallery-filter.tsx`,
  `creations-grid.tsx`, `active-jobs-indicator.tsx`. Create flow: `create/*`. Misc: `header.tsx`,
  `network-selector.tsx`, `dimension-slider.tsx`, `error-boundary.tsx`.
- Director onboarding: `create/director/*` exposes one contextual coach mark at a time in the required
  first-render order: add a segment, select it, enter a prompt, generate a private Krea 2 Turbo start
  frame or upload one, then render.
  Coach marks stop after the project has a completed segment.
- Director billing UI shows only Core-owned balances and quotes, links `402`
  recovery to Console funding, and copies only server-observed Core receipt IDs.

## Local Contracts

- Components consume `lib/` (stores, hooks, `api.ts`) — no direct `fetch` of the Go API, no raw
  token handling. Auth state comes from `useAuthStore`.
- **Auth components must not read or store the JWT** — it's an httpOnly cookie. Use the store's
  markers (address, Google profile) for display and `credentials: 'include'` on any auth fetch.
- A connected wallet under a Google session uses the exact-purpose Core link
  challenge; connecting a wallet alone never silently merges accounts.
- Keep both proof directions in the single account control. It is the user's
  path for linking an existing funded account; hiding either direction creates
  split balances that the user cannot reconcile from the product.
- Logged-out navigation exposes one `Sign in` action. The unified chooser is
  Google-first with wallet providers below it; do not present wallet connection
  as a second competing login. Under a Google session, label the wallet action
  `Link wallet` so its account-merge meaning is explicit. Deduplicate connector
  instances by provider name so WalletConnect appears once.
- Browser-wallet disconnect and AIPG sign-out are separate actions. Neither
  wallet reconnect nor page reload may trigger a signature prompt.
- Provider-rendered sign-in controls must measure their container and fit the
  narrow account menu; do not assume a fixed desktop button width.
- Keep the header in its compact menu below the `xl` breakpoint. Authenticated
  account actions and the full navigation must never compete for horizontal
  space at tablet or narrow-desktop widths.
- Keep the gallery filter trigger fixed-size. Its active count is an overlay,
  not content that may resize the search/filter row.
- Source-image controls render only when the selected model declares
  `img2img`/`img2video` (or requires an image). Do not infer support from modality.
- Model controls surface Core-derived offline state, and generation controls
  must not submit a model that is explicitly offline.
- Batch controls render only for a production-certified text-to-image workflow.
  Hide the control when the worker cannot prove requested output cardinality.
- Keep components presentational; push nontrivial logic into `lib/hooks` or `lib/stores`.

## Work Guidance

- New UI → reuse primitives here; add shared state via a `lib/store` and data via a `lib/hook`.

## Verification

- `npm run build` + `npx tsc --noEmit`.

## Child DOX Index

- None — leaf.
