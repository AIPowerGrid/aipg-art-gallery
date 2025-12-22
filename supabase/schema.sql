-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create generations table to store all generated images/videos
CREATE TABLE IF NOT EXISTS generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    job_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    seed TEXT,
    width INTEGER,
    height INTEGER,
    steps INTEGER,
    cfg_scale DECIMAL,
    sampler TEXT,
    scheduler TEXT,
    length INTEGER, -- for videos
    fps INTEGER, -- for videos
    generation_type TEXT NOT NULL CHECK (generation_type IN ('image', 'video')),
    media_url TEXT,
    media_base64 TEXT,
    thumbnail_url TEXT,
    is_public BOOLEAN DEFAULT true,
    is_nsfw BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for public gallery queries
CREATE INDEX IF NOT EXISTS idx_generations_public ON generations(is_public, created_at DESC) WHERE is_public = true;

-- Create index for user queries
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id, created_at DESC);

-- Create index for model queries
CREATE INDEX IF NOT EXISTS idx_generations_model ON generations(model_id, created_at DESC);

-- Create index for job_id lookups
CREATE INDEX IF NOT EXISTS idx_generations_job_id ON generations(job_id);

-- Enable Row Level Security
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view public generations
CREATE POLICY "Public generations are viewable by everyone"
    ON generations FOR SELECT
    USING (is_public = true);

-- Policy: Users can view their own generations
CREATE POLICY "Users can view their own generations"
    ON generations FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own generations
CREATE POLICY "Users can insert their own generations"
    ON generations FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Policy: Users can update their own generations
CREATE POLICY "Users can update their own generations"
    ON generations FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own generations
CREATE POLICY "Users can delete their own generations"
    ON generations FOR DELETE
    USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_generations_updated_at
    BEFORE UPDATE ON generations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

