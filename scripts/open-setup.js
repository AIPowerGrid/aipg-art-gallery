const { exec } = require('child_process')
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

async function main() {
  try {
    const env = loadEnv()
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL

    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not found')
    }

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (!projectRef) {
      throw new Error('Invalid Supabase URL')
    }

    const sqlEditorURL = `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    const authProvidersURL = `https://supabase.com/dashboard/project/${projectRef}/auth/providers`
    const callbackURL = `${supabaseUrl.replace('/rest/v1', '')}/auth/v1/callback`

    console.log('🚀 Opening Supabase Setup Pages...\n')
    console.log('📋 Project:', projectRef)
    console.log('📋 Callback URL:', callbackURL)
    console.log('')

    // Read SQL schema
    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql')
    const sql = fs.readFileSync(schemaPath, 'utf-8')

    console.log('📝 Step 1: Execute SQL Schema')
    console.log('─'.repeat(60))
    console.log('Opening SQL Editor in browser...')
    openURL(sqlEditorURL)
    console.log(`\n👉 SQL Editor: ${sqlEditorURL}`)
    console.log('\nCopy and paste this SQL:')
    console.log('─'.repeat(60))
    console.log(sql)
    console.log('─'.repeat(60))
    console.log('\nPress Enter after executing the SQL to continue...')
    
    // Wait for user input (in a real scenario, this would be interactive)
    console.log('\n📝 Step 2: Configure OAuth Providers')
    console.log('─'.repeat(60))
    console.log('Opening Auth Providers page in browser...')
    openURL(authProvidersURL)
    console.log(`\n👉 Auth Providers: ${authProvidersURL}`)
    console.log(`\nRequired redirect URL: ${callbackURL}\n`)
    console.log('Configure these providers:')
    console.log('  1. GitHub')
    console.log('  2. Google')
    console.log('  3. Facebook')
    console.log('  4. Twitter (X)')
    console.log('  5. Apple\n')
    console.log('For each provider:')
    console.log('  - Enable the provider')
    console.log(`  - Set redirect URL to: ${callbackURL}`)
    console.log('  - Add Client ID and Client Secret')
    console.log('  - Save\n')

    console.log('✨ Setup pages opened in browser!')
    console.log('   Complete the steps above, then verify with: node scripts/verify-setup.js')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

