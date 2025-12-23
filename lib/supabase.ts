/**
 * Supabase stub - this file exists for backwards compatibility
 * The app now uses localStorage + Grid API instead of Supabase
 */

// Stub client that does nothing
export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    signOut: async () => ({ error: null }),
    signInWithOAuth: async () => ({ error: null }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
    insert: async () => ({ error: null }),
    update: () => ({
      eq: async () => ({ error: null }),
    }),
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
  }),
};

// Type definitions kept for compatibility
export interface Generation {
  id: string;
  user_id: string | null;
  job_id: string;
  model_id: string;
  prompt: string;
  negative_prompt: string | null;
  seed: string | null;
  width: number | null;
  height: number | null;
  steps: number | null;
  cfg_scale: number | null;
  sampler: string | null;
  scheduler: string | null;
  length: number | null;
  fps: number | null;
  generation_type: 'image' | 'video';
  media_url: string | null;
  media_base64: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  is_nsfw: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email?: string;
  user_metadata?: {
    avatar_url?: string;
    full_name?: string;
    preferred_username?: string;
  };
}
