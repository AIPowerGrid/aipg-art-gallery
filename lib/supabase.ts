import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface Generation {
  id: string
  user_id: string | null
  job_id: string
  model_id: string
  prompt: string
  negative_prompt: string | null
  seed: string | null
  width: number | null
  height: number | null
  steps: number | null
  cfg_scale: number | null
  sampler: string | null
  scheduler: string | null
  length: number | null
  fps: number | null
  generation_type: 'image' | 'video'
  media_url: string | null
  media_base64: string | null
  thumbnail_url: string | null
  is_public: boolean
  is_nsfw: boolean
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email?: string
  user_metadata?: {
    avatar_url?: string
    full_name?: string
    preferred_username?: string
  }
}

