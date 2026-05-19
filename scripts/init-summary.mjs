import { Pool } from 'pg'
import fs from 'fs'

async function run() {
  // Simple env parser
  const env = fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const [key, ...val] = line.split('=')
      if (key && val.length) acc[key.trim()] = val.join('=').trim()
      return acc
    }, {})

  const dbUrl = env['DATABASE_URL']
  if (!dbUrl) {
    console.error('DATABASE_URL not found in .env.local')
    return
  }
  
  const pool = new Pool({ 
    connectionString: dbUrl, 
    ssl: { rejectUnauthorized: false } 
  })
  const sql = fs.readFileSync('db/summary_optimization.sql', 'utf8')
  
  console.log('Running summary optimization...')
  try {
    await pool.query(sql)
    console.log('Success!')
  } catch (err) {
    console.error('Error:', err)
  } finally {
    await pool.end()
  }
}

run()
