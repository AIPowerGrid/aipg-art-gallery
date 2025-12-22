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

async function verifySetup() {
  try {
    console.log('🔍 Verifying Supabase setup...\n')
    
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !anonKey) {
      console.log('❌ Missing Supabase credentials in .env')
      return false
    }

    const supabase = createClient(supabaseUrl, anonKey)

    // Check if generations table exists
    console.log('📋 Checking if generations table exists...')
    const { data, error } = await supabase
      .from('generations')
      .select('id')
      .limit(1)

    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.log('❌ Generations table does not exist')
        console.log('   Please run the SQL schema from supabase/schema.sql')
        return false
      } else {
        console.log('⚠️  Error checking table:', error.message)
        return false
      }
    }

    console.log('✅ Generations table exists!')
    console.log('✅ Setup verified successfully!\n')
    return true

  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

verifySetup().then(success => {
  if (!success) {
    console.log('\n📋 Setup Instructions:')
    console.log('   1. Run: node scripts/setup-supabase-api.js')
    console.log('   2. Follow the instructions to execute SQL and configure OAuth')
    process.exit(1)
  }
})

