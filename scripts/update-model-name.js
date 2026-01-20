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

async function updateModelName(connectionString, oldModel, newModel) {
  const client = new Client({
    connectionString: connectionString,
    ssl: false
  })

  try {
    await client.connect()
    console.log('✅ Connected to PostgreSQL database\n')
    
    // First, check how many records will be affected
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM gallery_items WHERE model = $1',
      [oldModel]
    )
    const count = parseInt(countResult.rows[0].count)
    
    console.log(`📊 Found ${count} records with model="${oldModel}"\n`)
    
    if (count === 0) {
      console.log('⚠️  No records to update. Exiting.')
      return
    }

    // Show a sample of what will be updated
    console.log('📋 Sample records to update:')
    const sampleResult = await client.query(
      'SELECT job_id, model, prompt FROM gallery_items WHERE model = $1 LIMIT 5',
      [oldModel]
    )
    sampleResult.rows.forEach(row => {
      console.log(`   - JobID: ${row.job_id}, Model: ${row.model}, Prompt: ${row.prompt.substring(0, 50)}...`)
    })
    console.log()
    
    // Update the model name
    console.log(`🔄 Updating model from "${oldModel}" to "${newModel}"...`)
    const updateResult = await client.query(
      'UPDATE gallery_items SET model = $1 WHERE model = $2',
      [newModel, oldModel]
    )
    
    console.log(`✅ Successfully updated ${updateResult.rowCount} records!`)
    
    // Verify the update
    const verifyResult = await client.query(
      'SELECT COUNT(*) as count FROM gallery_items WHERE model = $1',
      [newModel]
    )
    console.log(`\n✓ Verification: ${verifyResult.rows[0].count} records now have model="${newModel}"`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    console.log('🚀 Model Name Update Script\n')
    
    const env = loadEnv()
    const connectionString = env.POSTGRES_CONN_STR
    
    if (!connectionString) {
      throw new Error('POSTGRES_CONN_STR not found in .env file')
    }
    
    console.log('📝 Configuration:')
    console.log(`   Old model name: "public-art"`)
    console.log(`   New model name: "aipg-red"`)
    console.log()
    
    await updateModelName(connectionString, 'public-art', 'aipg-red')
    
    console.log('\n✨ Done!')
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('pg')) {
      console.log('\n📦 Install PostgreSQL client: npm install pg')
    }
    
    process.exit(1)
  }
}

main()
