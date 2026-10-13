# scripts — build verification, legacy setup and maintenance

## Purpose

Build verification plus one-off historical Supabase, gallery data import/migration,
and maintenance tooling. These scripts are not part of the app runtime.

## Ownership

- `check-build-privacy.mjs` plus its Node test suite verifies that Next's
  private framework signing/encryption keys do not appear in public static
  assets or prerendered HTML/RSC/response bodies. CI runs it after the build.
  Missing manifests, unknown key shapes, symlinks and excessive output sizes
  fail closed. Logs never contain key values. This is not general secret
  scanning; full-history Gitleaks remains independently required.

- Legacy Supabase setup: `setup-supabase*.{js,ts,py}`, `run-sql-schema*.js`,
  `execute-sql-*.js`, `open-setup.js`, `setup-with-browser.js`, `verify-setup.js`,
  `setup-complete.md`, and `supabase/schema.sql`. These do not create the live Go schema.
- Data import / migration: `import-piwigo.js`, `import-tarball.js`.
- Maintenance: `shuffle-gallery.{js,sh}`, `fix-dimensions.js`, `update-model-name.js`,
  `verify-model-update.js`.

## Local Contracts

- These are throwaway/admin scripts, not the source of truth. The production PostgreSQL schema
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
