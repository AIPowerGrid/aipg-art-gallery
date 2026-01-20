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

async function verifyModelUpdate(connectionString) {
  const client = new Client({
    connectionString: connectionString,
    ssl: false
  })

  try {
    await client.connect()
    console.log('✅ Connected to PostgreSQL database\n')
    
    // Check for old model name
    const oldModelResult = await client.query(
      'SELECT COUNT(*) as count FROM gallery_items WHERE model = $1',
      ['public-art']
    )
    const oldCount = parseInt(oldModelResult.rows[0].count)
    
    // Check for new model name
    const newModelResult = await client.query(
      'SELECT COUNT(*) as count FROM gallery_items WHERE model = $1',
      ['aipg-red']
    )
    const newCount = parseInt(newModelResult.rows[0].count)
    
    // Get all unique model names
    const allModelsResult = await client.query(
      'SELECT model, COUNT(*) as count FROM gallery_items WHERE model IS NOT NULL GROUP BY model ORDER BY count DESC'
    )
    
    console.log('📊 Model Update Verification Report')
    console.log('=' .repeat(50))
    console.log(`\n❌ Records with old model "public-art": ${oldCount}`)
    console.log(`✅ Records with new model "aipg-red": ${newCount}`)
    console.log('\n📋 All Models in Database:')
    allModelsResult.rows.forEach(row => {
      const indicator = row.model === 'aipg-red' ? '✓' : ' '
      console.log(`   ${indicator} ${row.model}: ${row.count} records`)
    })
    
    console.log('\n' + '='.repeat(50))
    if (oldCount === 0 && newCount > 0) {
      console.log('✅ VERIFICATION SUCCESSFUL! All records updated.')
    } else if (oldCount > 0) {
      console.log('⚠️  WARNING: Some records still have the old model name!')
    } else {
      console.log('⚠️  WARNING: No records found with the new model name!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  } finally {
    await client.end()
  }
}

async function main() {
  try {
    const env = loadEnv()
    const connectionString = env.POSTGRES_CONN_STR
    
    if (!connectionString) {
      throw new Error('POSTGRES_CONN_STR not found in .env file')
    }
    
    await verifyModelUpdate(connectionString)
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    process.exit(1)
  }
}

main()
