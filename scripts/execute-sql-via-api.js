const https = require('https')
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

async function executeSQLViaManagementAPI(projectRef, accessToken, sql) {
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

    console.log('🚀 Executing SQL schema via Supabase API...\n')

    if (!serviceRoleKey) {
      console.log('⚠️  SUPABASE_SERVICE_ROLE_KEY not found')
      console.log('   Using browser automation instead...\n')
      // Will use browser automation
      return { useBrowser: true, projectRef, sql }
    }

    try {
      const result = await executeSQLViaManagementAPI(projectRef, serviceRoleKey, sql)
      console.log('✅ SQL executed successfully!')
      return { success: true, result }
    } catch (error) {
      console.log('⚠️  API execution failed:', error.message)
      console.log('   Using browser automation instead...\n')
      return { useBrowser: true, projectRef, sql }
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  }
}

main().then(result => {
  if (result.useBrowser) {
    console.log('📋 Will use browser automation to execute SQL')
  }
}).catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})

