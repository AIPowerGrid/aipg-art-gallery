CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR UNIQUE,
    username VARCHAR,
    avatar_url TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    last_seen_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    media_url TEXT NOT NULL,
    thumbnail_url TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model VARCHAR,
    width INTEGER,
    height INTEGER,
    steps INTEGER,
    cfg_scale NUMERIC,
    sampler VARCHAR,
    scheduler VARCHAR,
    seed BIGINT,
    worker_id VARCHAR,
    wallet_address VARCHAR,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    sort_order INTEGER,
    type VARCHAR DEFAULT 'image',
    is_nsfw BOOLEAN DEFAULT false,
    random_sort DOUBLE PRECISION DEFAULT random(),
    seeds TEXT[]
);

CREATE TABLE IF NOT EXISTS generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR NOT NULL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_address VARCHAR,
    status VARCHAR DEFAULT 'pending',
    prompt TEXT,
    negative_prompt TEXT,
    model VARCHAR,
    params JSONB,
    result_url TEXT,
    gallery_item_id UUID REFERENCES gallery_items(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR NOT NULL,
    job_id VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    UNIQUE (wallet_address, job_id)
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_public ON gallery_items(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_public_random ON gallery_items(is_public, random_sort)
    WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_gallery_random_sort ON gallery_items(random_sort);
CREATE INDEX IF NOT EXISTS idx_gallery_sort ON gallery_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_gallery_user ON gallery_items(user_id);
CREATE INDEX IF NOT EXISTS idx_gallery_wallet ON gallery_items(wallet_address);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_wallet ON generation_jobs(wallet_address);

CREATE INDEX IF NOT EXISTS idx_favorites_job ON favorites(job_id);
CREATE INDEX IF NOT EXISTS idx_favorites_wallet ON favorites(lower(wallet_address));
