const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found')
  }
  
  const env = {}
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim()
      }
    }
  })
  return env
}

async function executeSQLStatements(supabaseUrl, serviceRoleKey, sql) {
  // Create Supabase client with service role key
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`📝 Executing ${statements.length} SQL statements...\n`)

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    if (!statement) continue

    // Skip empty statements
    if (statement.length < 10) continue

    try {
      // Try to execute via RPC (requires a function to be created first)
      // For now, we'll use a workaround: execute via REST API
      console.log(`   [${i + 1}/${statements.length}] ${statement.substring(0, 60)}...`)
      
      // Note: Supabase JS client doesn't support direct SQL execution
      // We need to use the Management API or PostgreSQL connection
      // For now, we'll provide instructions
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`)
    }
  }
}

async function main() {
  try {
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not found')
    }

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!projectRef) {
      throw new Error('Invalid Supabase URL')
    }

    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    const sql = fs.readFileSync(schemaPath, 'utf-8')

    console.log('🚀 Supabase Database Setup\n')
    console.log(`📋 Project: ${projectRef}`)
    console.log(`📋 URL: ${supabaseUrl}\n`)

    if (serviceRoleKey) {
      console.log('✅ Service role key found, attempting to execute SQL...\n')
      await executeSQLStatements(supabaseUrl, serviceRoleKey, sql)
    } else {
      console.log('⚠️  Service role key not found in .env')
      console.log('   Add SUPABASE_SERVICE_ROLE_KEY to .env for automated setup\n')
    }

    console.log('\n📋 Manual Setup Instructions:')
    console.log('─'.repeat(60))
    console.log('1. Go to Supabase SQL Editor:')
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
    console.log('2. Copy and paste the SQL schema from: supabase/schema.sql\n')
    console.log('3. Click "Run" to execute\n')
    console.log('4. Configure OAuth providers at:')
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/auth/providers\n`)
    console.log('5. For each provider (GitHub, Google, Facebook, Twitter, Apple):')
    console.log('   - Enable the provider')
    console.log('   - Add Client ID and Client Secret')
    console.log(`   - Set redirect URL: ${supabaseUrl.replace('/rest/v1', '')}/auth/v1/callback`)
    console.log('─'.repeat(60))

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

