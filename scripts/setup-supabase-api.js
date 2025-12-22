const https = require('https')
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

async function executeSQLViaAPI(projectRef, accessToken, sql) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': accessToken
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed)
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`))
          }
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.write(JSON.stringify({ query: sql }))
    req.end()
  })
}

async function configureOAuthProvider(projectRef, accessToken, provider, config) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/auth/config/${provider}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': accessToken
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed)
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed)}`))
          }
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.write(JSON.stringify(config))
    req.end()
  })
}

async function main() {
  try {
    console.log('🚀 Setting up Supabase database and OAuth...\n')
    
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not found in .env')
    }

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!projectRef) {
      throw new Error('Invalid Supabase URL format')
    }

    console.log(`📋 Project Reference: ${projectRef}`)
    console.log(`📋 Supabase URL: ${supabaseUrl}\n`)

    // Read SQL schema
    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    const sql = fs.readFileSync(schemaPath, 'utf-8')

    console.log('📝 SQL Schema Execution:')
    console.log('─'.repeat(60))
    console.log('⚠️  Supabase Management API requires authentication token.')
    console.log('   Please run the SQL manually in the Supabase Dashboard:\n')
    console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
    console.log('   Copy and paste the following SQL:\n')
    console.log(sql)
    console.log('─'.repeat(60))

    console.log('\n🔐 OAuth Provider Configuration:')
    console.log('─'.repeat(60))
    console.log('   Configure OAuth providers in Supabase Dashboard:\n')
    console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}/auth/providers\n`)
    
    const callbackUrl = `${supabaseUrl.replace('/rest/v1', '')}/auth/v1/callback`
    console.log('   Required redirect URL for all providers:')
    console.log(`   ${callbackUrl}\n`)
    
    console.log('   Providers to configure:')
    console.log('   1. GitHub')
    console.log('   2. Google')
    console.log('   3. Facebook')
    console.log('   4. Twitter (X)')
    console.log('   5. Apple\n')
    
    console.log('   For each provider:')
    console.log('   - Enable the provider')
    console.log('   - Add Client ID and Client Secret from provider')
    console.log(`   - Set redirect URL to: ${callbackUrl}`)
    console.log('   - Save configuration')
    console.log('─'.repeat(60))

    console.log('\n✨ Setup instructions displayed above!')
    console.log('   Once SQL is executed and OAuth is configured, the gallery will be ready.')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

