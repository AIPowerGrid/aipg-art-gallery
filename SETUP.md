# AIPG Art Gallery Setup Guide

## Overview

The AIPG Art Gallery now includes:
- **Public Gallery**: Browse all publicly shared images and videos
- **User Authentication**: OAuth login with GitHub, Google, Facebook, X (Twitter), and Apple
- **User Profiles**: Save and manage your own creations
- **All Models**: Support for all 19 workflow models from comfy-bridge

## Prerequisites

1. Node.js 18+ and npm
2. Go 1.21+ (for the API server)
3. Supabase account (free tier works)

## Setup Steps

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Go to Authentication > Providers and enable:
   - GitHub
   - Google
   - Facebook
   - Twitter (X)
   - Apple
4. For each provider, configure OAuth credentials:
   - **GitHub**: Create OAuth App at https://github.com/settings/developers
   - **Google**: Create OAuth credentials in Google Cloud Console
   - **Facebook**: Create App in Facebook Developers
   - **Twitter**: Create App in Twitter Developer Portal
   - **Apple**: Configure in Apple Developer Portal
5. Copy your Supabase URL and anon key from Settings > API

### 2. Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Gallery API Configuration
NEXT_PUBLIC_GALLERY_API=http://localhost:4000/api

# Server Configuration (for Go API)
AIPG_API_URL=https://api.aipowergrid.io/api/v2
AIPG_API_KEY=your_default_api_key
AIPG_CLIENT_AGENT=AIPG-Art-Gallery:v2
MODEL_PRESETS_PATH=./server/config/model_presets.json
GALLERY_SERVER_ADDR=:4000
```

### 3. Install Dependencies

```bash
npm install
cd server
go mod download
cd ..
```

### 4. Run the Application

#### Development Mode

Terminal 1 - Go API Server:
```bash
cd server
go run ./cmd/api
```

Terminal 2 - Next.js Frontend:
```bash
npm run dev
```

Access the gallery at http://localhost:3000

#### Production Mode (Docker)

```bash
docker-compose up -d
```

## Features

### Public Gallery (`/gallery`)
- Browse all publicly shared images and videos
- Filter by type (all/images/videos)
- Filter by model
- View generation details

### User Authentication (`/auth/login`)
- OAuth login with 5 providers:
  - GitHub
  - Google
  - Facebook
  - X (Twitter)
  - Apple
- Automatic account creation on first login

### User Profile (`/profile`)
- View all your generated creations
- Toggle public/private visibility
- Delete generations
- View generation metadata

### Generation Page (`/`)
- Generate images and videos with all 19 supported models
- Automatically saves to database when "Share to gallery" is enabled
- View job status and results in real-time

## Supported Models

All 19 models from comfy-bridge workflows are now supported:

**Image Models:**
- Flux.1 Krea Dev
- Flux.1 Dev
- FLUX.1 Dev Kontext FP8
- Flux Kontext Dev Basic
- Flux.1 Schnell FP16/FP8 Compact
- Krea
- Chroma / Chroma Final
- SDXL 1.0 / SDXL / SDXL1
- TurboVision

**Video Models:**
- WAN 2.2 T2V 5B
- WAN 2.2 T2V 14B
- WAN 2.2 T2V A14B
- WAN 2.2 T2V 14B HQ
- WAN 2.2 T2V A14B HQ
- LTX-Video

## Database Schema

The `generations` table stores:
- User ID (nullable for anonymous generations)
- Job ID, model ID, prompts
- Generation parameters (width, height, steps, etc.)
- Media URLs and base64 data
- Public/private visibility
- NSFW flag
- Timestamps

## Security

- Row Level Security (RLS) enabled on generations table
- Users can only view/edit their own generations
- Public generations are viewable by everyone
- OAuth providers handle authentication securely

## Troubleshooting

### OAuth not working
- Check that redirect URLs are configured in Supabase
- Ensure OAuth credentials are correct in Supabase dashboard
- Check browser console for errors

### Generations not saving
- Verify Supabase environment variables are set
- Check that RLS policies are correctly configured
- Ensure user is authenticated (optional for public generations)

### Models not showing
- Verify `model_presets.json` includes all models
- Check that Go API server is running
- Verify API can reach AIPG Grid API

