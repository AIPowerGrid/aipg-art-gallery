# scripts — ops, data-import, and Supabase-setup scripts

## Purpose

One-off operational tooling: Supabase/Postgres schema setup, gallery data import/migration,
and gallery maintenance. Run by hand, not part of the app runtime.

## Ownership

- Supabase/DB setup: `setup-supabase*.{js,ts,py}`, `run-sql-schema*.js`, `execute-sql-*.js`,
  `open-setup.js`, `setup-with-browser.js`, `verify-setup.js`, `setup-complete.md`. Apply
  `supabase/schema.sql` (`npm run setup:supabase` → `setup-supabase.js`).
- Data import / migration: `import-piwigo.js`, `import-tarball.js`.
- Maintenance: `shuffle-gallery.{js,sh}`, `fix-dimensions.js`, `update-model-name.js`,
  `verify-model-update.js`.

## Local Contracts

- These are throwaway/admin scripts, not the source of truth: schema lives in
  `supabase/schema.sql`, runtime persistence is the Go `server/internal/gallery` store. Keep
  scripts consistent with those, not the reverse.
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

—

## Child DOX Index

- None — leaf.
