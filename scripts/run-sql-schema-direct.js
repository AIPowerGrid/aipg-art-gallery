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

async function executeSQL(supabaseUrl, serviceRoleKey, sql) {
  // Create Supabase client with service role key
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

  // Supabase JS client doesn't support direct SQL execution
  // We need to use the Management API or PostgreSQL connection
  // For now, we'll use the REST API endpoint
  
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  
  // Try using Supabase REST API to execute SQL
  // Note: This requires Management API access token, not service role key
  // So we'll provide instructions instead
  
  return { projectRef, statements }
}

async function main() {
  try {
    console.log('🚀 Executing SQL Schema for Supabase...\n')
    
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not found')
    }

    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    const sql = fs.readFileSync(schemaPath, 'utf-8')

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    
    console.log(`📋 Project: ${projectRef}`)
    console.log(`📋 URL: ${supabaseUrl}\n`)

    // Since Supabase JS client doesn't support direct SQL execution,
    // we'll use the Supabase Management API via HTTP
    if (serviceRoleKey) {
      console.log('✅ Service role key found')
      console.log('⚠️  Note: Supabase JS client cannot execute raw SQL directly.')
      console.log('   We need to use the Supabase Management API or PostgreSQL connection.\n')
    }

    // Use fetch to call Supabase Management API
    const managementAPIUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
    
    console.log('📝 Attempting to execute SQL via Management API...\n')
    
    try {
      const response = await fetch(managementAPIUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey || 'missing'}`,
          'apikey': serviceRoleKey || 'missing'
        },
        body: JSON.stringify({ query: sql })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ SQL executed successfully!')
        console.log('Result:', JSON.stringify(result, null, 2))
        return
      } else {
        const errorText = await response.text()
        console.log(`⚠️  Management API returned ${response.status}: ${errorText}`)
        console.log('\n📋 This is expected - Supabase Management API requires a different token.')
        console.log('   Please execute SQL manually in the dashboard.\n')
      }
    } catch (error) {
      console.log(`⚠️  API call failed: ${error.message}`)
      console.log('\n📋 Please execute SQL manually in the Supabase dashboard.\n')
    }

    console.log('📋 Manual SQL Execution Instructions:')
    console.log('─'.repeat(60))
    console.log(`1. Go to: https://supabase.com/dashboard/project/${projectRef}/sql/new`)
    console.log('2. Copy the SQL below and paste it into the editor')
    console.log('3. Click "Run" to execute\n')
    console.log('SQL to execute:')
    console.log('─'.repeat(60))
    console.log(sql)
    console.log('─'.repeat(60))

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

