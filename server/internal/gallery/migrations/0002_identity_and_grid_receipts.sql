-- Google-only accounts cannot satisfy the original wallet requirement.
ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)
    WHERE google_id IS NOT NULL;

ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS worker TEXT;
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS gen_time DOUBLE PRECISION;
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS grid_job_id TEXT;

CREATE INDEX IF NOT EXISTS idx_gallery_items_grid_job_id ON gallery_items(grid_job_id)
    WHERE grid_job_id IS NOT NULL;
