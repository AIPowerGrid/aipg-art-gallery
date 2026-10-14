# scripts — build verification, setup, data-import, and maintenance

## Purpose

Build-time verification plus one-off historical Supabase setup, gallery data
import/migration and gallery maintenance. None is an app runtime endpoint.

## Ownership

- Legacy Supabase setup: `setup-supabase*.{js,ts,py}`, `run-sql-schema*.js`,
  `execute-sql-*.js`, `open-setup.js`, `setup-with-browser.js`, `verify-setup.js`,
  `setup-complete.md`, and `supabase/schema.sql`. These do not create the live Go schema.
- Data import / migration: `import-piwigo.js`, `import-tarball.js`.
- Maintenance: `shuffle-gallery.{js,sh}`, `fix-dimensions.js`, `update-model-name.js`,
  `verify-model-update.js`.
- `check-build-privacy.mjs` and its Node test - inspect actual Next private
  framework-key metadata, then check static and prerendered public outputs for
  those exact values. Reject missing metadata, unexpected shapes, symlinks and
  excessive sizes; never log key values. This is not a general secret scanner.

## Local Contracts

- Setup/import/maintenance scripts are admin tooling, not the source of truth. The production PostgreSQL schema
  lives in `server/internal/gallery/migrations/` and is applied by the Go service at startup.
- Do not use `npm run setup:supabase` for a production Gallery deployment.
- Generation automation must use the authenticated Gallery/Core account flow.
  Do not restore the retired unauthenticated submit-and-poll batch generator.
- Read creds from env/`.env`; never hardcode keys or connection strings — not even as a
  `process.env.X || "literal"` fallback (that literal is a committed secret).
- Shell out with argv arrays (`execFileSync(cmd, [args])`), never interpolated command strings
  built from filenames or other external input (shell-injection).
- Disabling TLS verification (`rejectUnauthorized: false`, `sslmode=disable`) is prohibited
  outside throwaway localhost-only use; prefer `sslmode=require`/`verify-full`.

## Work Guidance

—

## Verification

- `node --test scripts/check-build-privacy.test.mjs`
- After `npm run build`: `node scripts/check-build-privacy.mjs`

## Child DOX Index

- None — leaf.
