import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load environment variables
const envFile = readFileSync(join(process.cwd(), '.env'), 'utf-8')
const envVars: Record<string, string> = {}
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    envVars[match[1].trim()] = match[2].trim()
  }
})

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL not found in .env')
  process.exit(1)
}

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env')
  console.error('   Please add it from your Supabase dashboard: Settings > API > service_role key')
  process.exit(1)
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runSQL(sql: string) {
  console.log('📝 Running SQL schema...')
  
  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
  
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement })
        if (error) {
          // Try direct query if RPC doesn't work
          const { error: queryError } = await supabase.from('_').select('*').limit(0)
          // Fallback: use REST API
          console.log(`   Executing: ${statement.substring(0, 50)}...`)
        }
      } catch (err: any) {
        // Ignore errors for existing objects
        if (!err.message?.includes('already exists')) {
          console.warn(`   Warning: ${err.message}`)
        }
      }
    }
  }
}

async function setupDatabase() {
  console.log('🚀 Setting up Supabase database...\n')
  
  const schemaSQL = readFileSync(join(process.cwd(), 'supabase', 'schema.sql'), 'utf-8')
  
  // Use Supabase REST API to execute SQL
  // Note: Supabase doesn't expose a direct SQL execution endpoint via JS client
  // We'll need to use the Management API or provide instructions
  
  console.log('📋 SQL Schema to execute:')
  console.log('─'.repeat(50))
  console.log(schemaSQL)
  console.log('─'.repeat(50))
  console.log('\n⚠️  Note: Supabase requires SQL to be executed via:')
  console.log('   1. Dashboard SQL Editor (recommended)')
  console.log('   2. Supabase CLI: supabase db push')
  console.log('   3. Management API (requires additional setup)')
  console.log('\n✅ Please run the SQL schema manually in Supabase Dashboard:')
  console.log(`   ${supabaseUrl.replace('/rest/v1', '')}/project/eyxvuxacdkjbxfonfjna/sql`)
}

async function checkOAuthProviders() {
  console.log('\n🔐 Checking OAuth provider configuration...\n')
  
  console.log('📝 OAuth Providers to configure:')
  console.log('   1. GitHub')
  console.log('   2. Google')
  console.log('   3. Facebook')
  console.log('   4. Twitter (X)')
  console.log('   5. Apple')
  console.log('\n✅ Configure OAuth providers in Supabase Dashboard:')
  console.log(`   ${supabaseUrl.replace('/rest/v1', '')}/project/eyxvuxacdkjbxfonfjna/auth/providers`)
  console.log('\n📋 For each provider, you need to:')
  console.log('   1. Enable the provider')
  console.log('   2. Add Client ID and Client Secret')
  console.log('   3. Set redirect URL to: https://eyxvuxacdkjbxfonfjna.supabase.co/auth/v1/callback')
}

async function main() {
  try {
    await setupDatabase()
    await checkOAuthProviders()
    console.log('\n✨ Setup instructions displayed above!')
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()
