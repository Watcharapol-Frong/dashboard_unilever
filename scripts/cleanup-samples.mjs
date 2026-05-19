import { Pool } from 'pg'
import fs from 'fs'

async function run() {
  const env = fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const [key, ...val] = line.split('=')
      if (key && val.length) acc[key.trim()] = val.join('=').trim()
      return acc
    }, {})

  const dbUrl = env['DATABASE_URL']
  if (!dbUrl) return

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  
  try {
    console.log('Cleaning up sample data...')
    
    // 1. Delete samples
    await pool.query("DELETE FROM products WHERE prod_num IN ('P001', 'P002')")
    await pool.query("DELETE FROM leads WHERE mmid IN ('M001', 'M002')")
    
    // 2. Delete associated batches
    await pool.query("DELETE FROM upload_batches WHERE filename IN ('sample_products.csv', 'sample_leads.csv')")
    
    console.log('Re-initializing table summaries...')
    
    // 3. Recalculate summaries to be 100% accurate
    const initSql = fs.readFileSync('db/summary_optimization.sql', 'utf8')
    await pool.query(initSql)
    
    console.log('Cleanup successful!')
  } catch (err) {
    console.error('Error during cleanup:', err)
  } finally {
    await pool.end()
  }
}

run()
