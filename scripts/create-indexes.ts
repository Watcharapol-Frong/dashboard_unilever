import { query } from '../src/lib/db'

// Source table indexes — run once after schema changes via: npm run indexes
// Mart table indexes are created automatically inside mart.ts on each build.
const indexes = [
  // telesales_calls — primary filter axes
  {
    name: 'idx_tc_date',
    sql: `CREATE INDEX IF NOT EXISTS idx_tc_date    ON telesales_calls (first_connected_date)`,
    desc: 'Date-range filters on telesales routes',
  },
  {
    name: 'idx_tc_agent',
    sql: `CREATE INDEX IF NOT EXISTS idx_tc_agent   ON telesales_calls (agent)`,
    desc: 'Agent filter on telesales routes',
  },
  {
    name: 'idx_tc_mmid',
    sql: `CREATE INDEX IF NOT EXISTS idx_tc_mmid    ON telesales_calls (mmid)`,
    desc: 'JOIN on mmid across routes',
  },
  {
    name: 'idx_tc_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_tc_status  ON telesales_calls (call_status)`,
    desc: 'REACHED filter in mart build and route queries',
  },

  // online_sales / offline_sales — JOIN and date filters
  {
    name: 'idx_os_mmid',
    sql: `CREATE INDEX IF NOT EXISTS idx_os_mmid    ON online_sales (mmid)`,
    desc: 'JOIN on mmid in mart build',
  },
  {
    name: 'idx_os_date',
    sql: `CREATE INDEX IF NOT EXISTS idx_os_date    ON online_sales (order_date)`,
    desc: 'Date-range filters in mart build',
  },
  {
    name: 'idx_fs_mmid',
    sql: `CREATE INDEX IF NOT EXISTS idx_fs_mmid    ON offline_sales (mmid)`,
    desc: 'JOIN on mmid in mart build',
  },
  {
    name: 'idx_fs_date',
    sql: `CREATE INDEX IF NOT EXISTS idx_fs_date    ON offline_sales (order_date)`,
    desc: 'Date-range filters in mart build',
  },

  // products — JOIN in mart build
  {
    name: 'idx_prod_num',
    sql: `CREATE INDEX IF NOT EXISTS idx_prod_num   ON products (prod_num)`,
    desc: 'JOIN on prod_num in mart build',
  },

  // leads — MMID search
  {
    name: 'idx_leads_mmid',
    sql: `CREATE INDEX IF NOT EXISTS idx_leads_mmid ON leads (mmid)`,
    desc: 'MMID lookup on leads page',
  },

  // targets — date + CMG JOIN in mart performance build
  {
    name: 'idx_tgt_month_cmg',
    sql: `CREATE INDEX IF NOT EXISTS idx_tgt_month_cmg ON targets (month, dynamic_cmg)`,
    desc: 'JOIN in mart_performance_cmg build',
  },

  // upload_batches — file dedup
  {
    name: 'idx_ub_file_hash',
    sql: `ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS file_hash TEXT`,
    desc: 'Add file_hash column for duplicate-upload detection',
  },
  {
    name: 'idx_ub_file_hash_uidx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_ub_file_hash ON upload_batches (file_hash) WHERE file_hash IS NOT NULL`,
    desc: 'Unique index for file dedup (partial — only non-null)',
  },
]

async function createIndexes() {
  console.log('Creating source table indexes + schema extensions...\n')

  for (const idx of indexes) {
    try {
      process.stdout.write(`  ${idx.name} — ${idx.desc} ... `)
      await query(idx.sql, [])
      console.log('ok')
    } catch (err: unknown) {
      console.log(`SKIP (${(err as Error).message})`)
    }
  }

  console.log('\nDone. Mart indexes are created automatically on each Build Mart run.')
  process.exit(0)
}

createIndexes().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
