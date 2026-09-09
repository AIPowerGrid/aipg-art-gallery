-- Private broker receipts, not a second scheduler. Never store session tokens.
CREATE TABLE gallery_pending_jobs (
    job_id VARCHAR(32) PRIMARY KEY,
    owner VARCHAR(128) NOT NULL,
    request_id VARCHAR(64) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('processing', 'uncertain', 'completed', 'faulted')),
    payload JSONB NOT NULL CHECK (octet_length(payload::text) <= 131072),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner, request_id)
);
-- No public/anonymous PostgREST access, including on Supabase deployments.
ALTER TABLE gallery_pending_jobs ENABLE ROW LEVEL SECURITY;
