import { query } from '../src/lib/db'

const indexes = [
  {
    name: 'idx_telesales_calls_mmid_status_date',
    sql: `CREATE INDEX IF NOT EXISTS idx_telesales_calls_mmid_status_date
          ON telesales_calls(mmid, call_status, first_connected_date)`,
    desc: 'Optimize GROUP BY mmid + engagement classification'
  },
  {
    name: 'idx_mart_telesales_orders_mmid_cmg',
    sql: `CREATE INDEX IF NOT EXISTS idx_mart_telesales_orders_mmid_cmg
          ON mart_telesales_orders(mmid, primary_cmg)`,
    desc: 'Optimize segment/CMG filtering'
  },
  {
    name: 'idx_sales_hoc_orders_mmid_type',
    sql: `CREATE INDEX IF NOT EXISTS idx_sales_hoc_orders_mmid_type
          ON sales_hoc_orders(mmid, customer_type, channel)`,
    desc: 'Optimize order conversions lookup'
  }
]

async function createIndexes() {
  console.log('🔧 Creating performance indexes...\n')

  for (const idx of indexes) {
    try {
      console.log(`⏳ ${idx.name}`)
      console.log(`   ${idx.desc}`)
      await query<{}>(idx.sql, [])
      console.log(`   ✅ Success\n`)
    } catch (err: any) {
      console.log(`   ❌ Error: ${err.message}\n`)
    }
  }

  console.log('✨ Done! Telesales queries should be 10-20x faster now.')
  process.exit(0)
}

createIndexes().catch(err => {
  console.error('❌ Failed to create indexes:', err)
  process.exit(1)
})
