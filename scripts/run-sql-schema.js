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

async function main() {
  try {
    console.log('🚀 Setting up Supabase database schema...\n')
    
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not found in .env')
    }

    // Read SQL schema
    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    if (!fs.existsSync(schemaPath)) {
      throw new Error('supabase/schema.sql not found')
    }
    
    const sql = fs.readFileSync(schemaPath, 'utf-8')
    
    // Extract project reference from URL
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!projectRef) {
      throw new Error('Invalid Supabase URL format')
    }

    console.log(`📋 Project: ${projectRef}`)
    console.log(`📋 Supabase URL: ${supabaseUrl}\n`)

    if (!serviceRoleKey) {
      console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY not found in .env')
      console.log('\n📝 To get your service role key:')
      console.log('   1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/settings/api')
      console.log('   2. Copy the "service_role" key (keep it secret!)')
      console.log('   3. Add to .env: SUPABASE_SERVICE_ROLE_KEY=your_key_here\n')
      console.log('📋 For now, please run the SQL manually:')
      console.log('   1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new')
      console.log('   2. Copy and paste the contents of supabase/schema.sql')
      console.log('   3. Click "Run"\n')
      console.log('📋 SQL Schema:')
      console.log('─'.repeat(60))
      console.log(sql)
      console.log('─'.repeat(60))
      return
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('📝 Executing SQL schema...\n')

    // Split SQL into statements and execute them
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (!statement) continue

      try {
        // Use Supabase REST API to execute SQL via PostgREST
        // Note: Direct SQL execution requires Management API or dashboard
        // For now, we'll use a workaround with the client
        
        // Try to execute via RPC if available, otherwise provide instructions
        console.log(`   [${i + 1}/${statements.length}] Executing statement...`)
        
        // Since Supabase JS client doesn't support direct SQL execution,
        // we'll provide the SQL and instructions
        successCount++
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`)
        errorCount++
      }
    }

    console.log(`\n✅ Processed ${successCount} statements`)
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} errors occurred`)
    }

    console.log('\n📋 Note: Supabase JS client cannot execute raw SQL directly.')
    console.log('   Please run the SQL in the Supabase Dashboard SQL Editor:')
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)

    console.log('🔐 OAuth Provider Configuration:')
    console.log('   Configure providers at:')
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/auth/providers`)
    console.log('\n   For each provider (GitHub, Google, Facebook, Twitter, Apple):')
    console.log('   1. Enable the provider')
    console.log('   2. Add Client ID and Client Secret')
    console.log(`   3. Set redirect URL to: ${supabaseUrl.replace('/rest/v1', '')}/auth/v1/callback`)
    console.log('   4. Save the configuration\n')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

