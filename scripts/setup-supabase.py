#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Supabase Setup Script
Executes SQL schema and provides OAuth configuration instructions
"""

import os
import sys
import re
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def load_env():
    """Load environment variables from .env file"""
    env_path = Path(__file__).parent.parent / '.env'
    if not env_path.exists():
        raise FileNotFoundError('.env file not found')
    
    env = {}
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                parts = line.split('=', 1)
                if len(parts) == 2:
                    env[parts[0].strip()] = parts[1].strip()
    return env

def extract_project_ref(supabase_url):
    """Extract project reference from Supabase URL"""
    match = re.search(r'https://([^.]+)\.supabase\.co', supabase_url)
    return match.group(1) if match else None

def main():
    try:
        print('🚀 Supabase Database Setup\n')
        
        env = load_env()
        supabase_url = env.get('NEXT_PUBLIC_SUPABASE_URL')
        service_role_key = env.get('SUPABASE_SERVICE_ROLE_KEY')
        
        if not supabase_url:
            print('❌ NEXT_PUBLIC_SUPABASE_URL not found in .env')
            sys.exit(1)
        
        project_ref = extract_project_ref(supabase_url)
        if not project_ref:
            print('❌ Invalid Supabase URL format')
            sys.exit(1)
        
        print(f'📋 Project Reference: {project_ref}')
        print(f'📋 Supabase URL: {supabase_url}\n')
        
        # Read SQL schema
        schema_path = Path(__file__).parent.parent / 'supabase' / 'schema.sql'
        if not schema_path.exists():
            print('❌ supabase/schema.sql not found')
            sys.exit(1)
        
        sql = schema_path.read_text()
        
        print('📝 SQL Schema Execution:')
        print('─' * 60)
        
        if service_role_key:
            print('✅ Service role key found')
            print('\n⚠️  Note: Supabase JS/Python clients cannot execute raw SQL directly.')
            print('   You have two options:\n')
            print('   Option 1: Use Supabase Dashboard (Recommended)')
            print(f'   1. Go to: https://supabase.com/dashboard/project/{project_ref}/sql/new')
            print('   2. Copy and paste the SQL below')
            print('   3. Click "Run"\n')
            print('   Option 2: Use Supabase CLI')
            print('   1. Install: npm install -g supabase')
            print('   2. Login: supabase login')
            print('   3. Link: supabase link --project-ref ' + project_ref)
            print('   4. Push: supabase db push\n')
        else:
            print('⚠️  SUPABASE_SERVICE_ROLE_KEY not found in .env')
            print('   Get it from: Settings > API > service_role key\n')
            print('   Then add to .env:')
            print('   SUPABASE_SERVICE_ROLE_KEY=your_key_here\n')
        
        print('📋 SQL Schema to Execute:')
        print('─' * 60)
        print(sql)
        print('─' * 60)
        
        callback_url = f'{supabase_url.replace("/rest/v1", "")}/auth/v1/callback'
        
        print('\n🔐 OAuth Provider Configuration:')
        print('─' * 60)
        print(f'   Configure at: https://supabase.com/dashboard/project/{project_ref}/auth/providers\n')
        print(f'   Required redirect URL for ALL providers:')
        print(f'   {callback_url}\n')
        print('   Providers to configure:')
        print('   1. GitHub')
        print('   2. Google')
        print('   3. Facebook')
        print('   4. Twitter (X)')
        print('   5. Apple\n')
        print('   For each provider:')
        print('   - Enable the provider')
        print('   - Add Client ID and Client Secret')
        print(f'   - Set redirect URL to: {callback_url}')
        print('   - Save configuration')
        print('─' * 60)
        
        print('\n✨ Setup instructions displayed above!')
        print('   Once SQL is executed and OAuth is configured, restart the app.')
        
    except Exception as e:
        print(f'❌ Error: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()

