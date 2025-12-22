const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const https = require('https')

// Load environment variables from .env
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found')
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  envContent.split('\n').forEach(line => {
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
  return new Promise((resolve, reject) => {
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!projectRef) {
      reject(new Error('Invalid Supabase URL'))
      return
    }

    // Use Supabase Management API to execute SQL
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data))
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.write(JSON.stringify({ query: sql }))
    req.end()
  })
}

async function main() {
  try {
    console.log('🚀 Setting up Supabase database...\n')
    
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not found in .env')
    }

    if (!serviceRoleKey) {
      console.error('⚠️  SUPABASE_SERVICE_ROLE_KEY not found in .env')
      console.error('   Please add it from: Settings > API > service_role key')
      console.error('\n📋 Manual setup instructions:')
      console.error('   1. Go to Supabase Dashboard SQL Editor')
      console.error(`   2. Run the SQL from: supabase/schema.sql`)
      process.exit(1)
    }

    // Read SQL schema
    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    const sql = fs.readFileSync(schemaPath, 'utf-8')

    console.log('📝 Executing SQL schema...')
    
    try {
      await executeSQL(supabaseUrl, serviceRoleKey, sql)
      console.log('✅ SQL schema executed successfully!')
    } catch (error) {
      console.error('❌ Error executing SQL:', error.message)
      console.error('\n📋 Please run the SQL manually in Supabase Dashboard:')
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
      console.error(`   https://supabase.com/dashboard/project/${projectRef}/sql`)
      console.error('\nOr use Supabase CLI:')
      console.error('   supabase db push')
    }

    console.log('\n🔐 OAuth Provider Configuration:')
    console.log('   Configure providers in Supabase Dashboard:')
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/auth/providers`)
    console.log('\n   Required redirect URL for all providers:')
    console.log(`   ${supabaseUrl.replace('/rest/v1', '')}/auth/v1/callback`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()
