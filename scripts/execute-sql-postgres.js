const { Client } = require('pg')
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

async function executeSQLViaPostgres(connectionString, sql) {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  })

  try {
    await client.connect()
    console.log('✅ Connected to PostgreSQL database\n')
    
    // Split SQL into statements and execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📝 Executing ${statements.length} SQL statements...\n`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (!statement || statement.length < 10) continue

      try {
        console.log(`   [${i + 1}/${statements.length}] ${statement.substring(0, 60)}...`)
        await client.query(statement)
        console.log(`   ✅ Success`)
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`   ⚠️  Already exists (skipping)`)
        } else {
          console.log(`   ❌ Error: ${error.message}`)
          throw error
        }
      }
    }

    console.log('\n✅ All SQL statements executed successfully!')
    return true
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    console.log('🚀 Executing SQL Schema via PostgreSQL Connection...\n')
    
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

    // Construct PostgreSQL connection string from Supabase URL and service role key
    // Format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
    // We need the database password, which is different from the service role key
    
    // Check if we have a direct database connection string
    const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL
    
    if (!dbUrl && !serviceRoleKey) {
      console.log('⚠️  No database connection string or service role key found')
      console.log('\n📋 To get the database connection string:')
      console.log(`   1. Go to: https://supabase.com/dashboard/project/${projectRef}/settings/database`)
      console.log('   2. Copy the "Connection string" (URI format)')
      console.log('   3. Add to .env: DATABASE_URL=postgresql://...\n')
      console.log('   Or execute SQL manually in the dashboard:')
      console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
      return
    }

    if (dbUrl) {
      console.log('✅ Database connection string found\n')
      await executeSQLViaPostgres(dbUrl, sql)
    } else {
      console.log('⚠️  Cannot construct database connection string from service role key')
      console.log('   Service role key is for REST API, not direct database access')
      console.log('\n📋 Please either:')
      console.log('   1. Add DATABASE_URL to .env (from Supabase dashboard)')
      console.log('   2. Or execute SQL manually in the dashboard')
      console.log(`      https://supabase.com/dashboard/project/${projectRef}/sql/new\n`)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('pg')) {
      console.log('\n📦 Install PostgreSQL client: npm install pg')
    }
    
    process.exit(1)
  }
}

main()

