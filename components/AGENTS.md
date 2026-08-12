# components — React UI components

## Purpose

Reusable client UI for the gallery, generation flow, wallet/Google auth, and
layout. Presentation and interaction only; data and auth logic come from `lib/`.

## Ownership

- Auth UI: `custom-connect-button.tsx`, `wallet-button.tsx`, `auth-modal.tsx`, `social-auth.tsx`,
  `google-one-tap.tsx` (Google One Tap — posts the credential to the Go `/auth/google` with
  `credentials: 'include'` through `lib/google-identity.ts`; the server sets the
  httpOnly cookie). Google buttons and One Tap share one page-wide GSI
  initialization. `providers.tsx` wires Wagmi /
  RainbowKit / React Query and drives wallet SIWE sign-in + session reconcile on mount.
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
- Keep the wallet control available beside a Google session. It is the user's
  proof-of-both path for linking an existing funded wallet account; hiding it
  creates split balances that the user cannot reconcile from the product.
- Logged-out navigation exposes one `Sign in` action. The unified chooser is
  Google-first with wallet providers below it; do not present wallet connection
  as a second competing login. Under a Google session, label the wallet action
  `Link wallet` so its account-merge meaning is explicit. Deduplicate connector
  instances by provider name so WalletConnect appears once.
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
