const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

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

async function executeSQLViaSupabaseClient(supabaseUrl, serviceRoleKey, sql) {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  // Split SQL into statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`📝 Executing ${statements.length} SQL statements...\n`)

  // Try to execute via RPC function (if we create one)
  // Or use direct PostgreSQL connection
  
  // For now, let's try using the REST API endpoint
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  
  if (!projectRef) {
    // Try to extract from the URL format
    console.log('⚠️  Could not extract project reference from URL')
    return false
  }

  // Use fetch to call Supabase Management API
  try {
    const managementAPIUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
    
    console.log('📝 Attempting to execute SQL via Management API...\n')
    
    const response = await fetch(managementAPIUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey
      },
      body: JSON.stringify({ query: sql })
    })

    if (response.ok) {
      const result = await response.json()
      console.log('✅ SQL executed successfully!')
      console.log('Result:', JSON.stringify(result, null, 2))
      return true
    } else {
      const errorText = await response.text()
      console.log(`⚠️  Management API returned ${response.status}`)
      console.log('Response:', errorText)
      return false
    }
  } catch (error) {
    console.log(`⚠️  API call failed: ${error.message}`)
    return false
  }
}

async function main() {
  try {
    console.log('🚀 Executing SQL Schema with new API key...\n')
    
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || anonKey

    console.log('📋 Environment variables found:')
    console.log(`   URL: ${supabaseUrl ? '✅' : '❌'}`)
    console.log(`   Anon Key: ${anonKey ? '✅' : '❌'}`)
    console.log(`   Service Role Key: ${serviceRoleKey ? '✅' : '❌'}\n`)

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not found')
    }

    // Check if URL is in the correct format
    let projectRef
    if (supabaseUrl.startsWith('https://')) {
      projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    } else {
      // Might be a project reference directly
      projectRef = supabaseUrl
      console.log(`⚠️  URL doesn't start with https://, treating as project reference: ${projectRef}`)
    }

    if (!projectRef) {
      console.log('⚠️  Could not determine project reference')
      console.log('   Please ensure NEXT_PUBLIC_SUPABASE_URL is in format: https://[project-ref].supabase.co')
      return
    }

    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    const sql = fs.readFileSync(schemaPath, 'utf-8')

    console.log(`📋 Project Reference: ${projectRef}\n`)

    // Try executing SQL
    if (serviceRoleKey) {
      const fullUrl = supabaseUrl.startsWith('https://') ? supabaseUrl : `https://${projectRef}.supabase.co`
      const success = await executeSQLViaSupabaseClient(fullUrl, serviceRoleKey, sql)
      
      if (!success) {
        console.log('\n📋 SQL execution via API failed.')
        console.log('   This is expected - Supabase Management API requires a different token.')
        console.log('   Please execute SQL manually in the dashboard:')
        console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
      }
    } else {
      console.log('⚠️  No service role key found')
      console.log('   Please execute SQL manually in the dashboard:')
      console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
    }

    // Display SQL for manual execution
    console.log('📋 SQL Schema to Execute:')
    console.log('─'.repeat(60))
    console.log(sql)
    console.log('─'.repeat(60))

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

