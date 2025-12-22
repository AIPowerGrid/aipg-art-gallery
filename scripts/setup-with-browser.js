const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

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

function openURL(url) {
  const platform = process.platform
  let command
  
  if (platform === 'win32') {
    command = `start "" "${url}"`
  } else if (platform === 'darwin') {
    command = `open "${url}"`
  } else {
    command = `xdg-open "${url}"`
  }
  
  exec(command, (error) => {
    if (error) {
      console.log(`   Please manually open: ${url}`)
    }
  })
}

async function testSupabaseConnection(supabaseUrl, anonKey) {
  try {
    const supabase = createClient(supabaseUrl, anonKey)
    
    // Try a simple query to test connection
    const { data, error } = await supabase
      .from('generations')
      .select('id')
      .limit(1)
    
    if (error && error.code === 'PGRST116') {
      console.log('✅ Connected to Supabase (table does not exist yet - this is expected)\n')
      return true
    } else if (error) {
      console.log(`⚠️  Connection test returned: ${error.message}`)
      return false
    } else {
      console.log('✅ Connected to Supabase (table exists)\n')
      return true
    }
  } catch (error) {
    console.log(`⚠️  Connection test failed: ${error.message}`)
    return false
  }
}

async function main() {
  try {
    console.log('🚀 Setting up Supabase (Steps 1 & 2)...\n')
    
    const env = loadEnv()
    let supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY

    // Check if URL is in correct format
    if (!supabaseUrl.startsWith('https://')) {
      console.log('⚠️  NEXT_PUBLIC_SUPABASE_URL is not in standard format')
      console.log('   Expected: https://[project-ref].supabase.co')
      console.log(`   Found: ${supabaseUrl}\n`)
      
      // Try to construct URL if we have a project ref
      if (supabaseUrl.includes('_')) {
        // Might be a project reference in the key
        console.log('   Attempting to use browser automation with provided credentials...\n')
      }
    }

    // Extract project reference
    let projectRef = null
    if (supabaseUrl.startsWith('https://')) {
      projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    } else {
      // If URL is not in standard format, we'll need to get it from the user
      // For now, try the old project ref
      projectRef = 'eyxvuxacdkjbxfonfjna'
      supabaseUrl = `https://${projectRef}.supabase.co`
      console.log(`📋 Using project reference: ${projectRef}`)
      console.log(`📋 Constructed URL: ${supabaseUrl}\n`)
    }

    if (!projectRef) {
      console.log('❌ Could not determine project reference')
      console.log('   Please update .env with:')
      console.log('   NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co')
      return
    }

    // Test connection
    if (anonKey && supabaseUrl.startsWith('https://')) {
      console.log('🔍 Testing Supabase connection...')
      await testSupabaseConnection(supabaseUrl, anonKey)
    }

    // Read SQL schema
    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    const sql = fs.readFileSync(schemaPath, 'utf-8')

    const sqlEditorURL = `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    const authProvidersURL = `https://supabase.com/dashboard/project/${projectRef}/auth/providers`
    const callbackURL = `${supabaseUrl.replace('/rest/v1', '')}/auth/v1/callback`

    console.log('📝 Step 1: Execute SQL Schema')
    console.log('─'.repeat(60))
    console.log('Opening SQL Editor in browser...')
    openURL(sqlEditorURL)
    console.log(`\n👉 SQL Editor: ${sqlEditorURL}`)
    console.log('\nCopy and paste this SQL:')
    console.log('─'.repeat(60))
    console.log(sql)
    console.log('─'.repeat(60))
    console.log('\nThen click "Run" to execute\n')

    // Wait a bit before opening next page
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('🔐 Step 2: Configure OAuth Providers')
    console.log('─'.repeat(60))
    console.log('Opening Auth Providers page in browser...')
    openURL(authProvidersURL)
    console.log(`\n👉 Auth Providers: ${authProvidersURL}`)
    console.log(`\nRequired redirect URL for ALL providers:`)
    console.log(`   ${callbackURL}\n`)
    console.log('Configure these providers:')
    console.log('   1. GitHub')
    console.log('   2. Google')
    console.log('   3. Facebook')
    console.log('   4. Twitter (X)')
    console.log('   5. Apple\n')
    console.log('For each provider:')
    console.log('   - Enable the provider')
    console.log(`   - Set redirect URL to: ${callbackURL}`)
    console.log('   - Add Client ID and Client Secret from provider')
    console.log('   - Save configuration')
    console.log('─'.repeat(60))

    console.log('\n✨ Browser pages opened!')
    console.log('   Complete the steps above, then verify with: node scripts/verify-setup.js')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

