# Supabase Setup Complete Guide

## Project Information
- **Project Reference**: `eyxvuxacdkjbxfonfjna`
- **Supabase URL**: `https://eyxvuxacdkjbxfonfjna.supabase.co`
- **SQL Editor**: https://supabase.com/dashboard/project/eyxvuxacdkjbxfonfjna/sql/new
- **Auth Providers**: https://supabase.com/dashboard/project/eyxvuxacdkjbxfonfjna/auth/providers

## Step 1: Execute SQL Schema

1. Navigate to: https://supabase.com/dashboard/project/eyxvuxacdkjbxfonfjna/sql/new
2. Copy the entire contents of `supabase/schema.sql`
3. Paste into the SQL editor
4. Click "Run" to execute

The SQL will create:
- `generations` table for storing images/videos
- Indexes for performance
- Row Level Security (RLS) policies
- Triggers for automatic timestamp updates

## Step 2: Configure OAuth Providers

Navigate to: https://supabase.com/dashboard/project/eyxvuxacdkjbxfonfjna/auth/providers

### Required Redirect URL for ALL providers:
```
https://eyxvuxacdkjbxfonfjna.supabase.co/auth/v1/callback
```

### GitHub Setup:
1. Go to: https://github.com/settings/developers
2. Click "New OAuth App"
3. Set:
   - Application name: AIPG Art Gallery
   - Homepage URL: https://art.aipowergrid.io
   - Authorization callback URL: `https://eyxvuxacdkjbxfonfjna.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. In Supabase: Enable GitHub, paste credentials, Save

### Google Setup:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID
3. Set Authorized redirect URIs: `https://eyxvuxacdkjbxfonfjna.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. In Supabase: Enable Google, paste credentials, Save

### Facebook Setup:
1. Go to: https://developers.facebook.com/apps
2. Create App > Consumer
3. Add Facebook Login product
4. Set Valid OAuth Redirect URIs: `https://eyxvuxacdkjbxfonfjna.supabase.co/auth/v1/callback`
5. Copy App ID and App Secret
6. In Supabase: Enable Facebook, paste credentials, Save

### Twitter (X) Setup:
1. Go to: https://developer.twitter.com/en/portal/dashboard
2. Create App
3. Set Callback URL: `https://eyxvuxacdkjbxfonfjna.supabase.co/auth/v1/callback`
4. Copy API Key and API Secret
5. In Supabase: Enable Twitter, paste credentials, Save

### Apple Setup:
1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Create Services ID
3. Set Return URLs: `https://eyxvuxacdkjbxfonfjna.supabase.co/auth/v1/callback`
4. Create Key and download
5. In Supabase: Enable Apple, paste credentials, Save

## Step 3: Verify Setup

After completing the above steps:
1. Test OAuth login at: http://localhost:3000/auth/login
2. Generate an image/video with "Share to gallery" enabled
3. Check the gallery at: http://localhost:3000/gallery
4. Verify your creations at: http://localhost:3000/profile

## Troubleshooting

- **SQL errors**: Make sure you're running the SQL in the SQL Editor, not the Query Editor
- **OAuth not working**: Verify redirect URLs match exactly
- **RLS errors**: Ensure policies are created correctly
- **Service role key**: Get it from Settings > API > service_role key

