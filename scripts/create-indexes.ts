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
    name: 'idx_tc_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_tc_status  ON telesales_calls (call_status)`,
    desc: 'REACHED filter in mart build and route queries',
  },

  // NOTE: indexes previously listed here — idx_tc_mmid, idx_os_mmid, idx_os_date,
  // idx_fs_mmid, idx_fs_date, idx_prod_num, idx_leads_mmid, idx_tgt_month_cmg —
  // were removed. Each duplicated either a table's PRIMARY KEY (telesales_calls,
  // products, leads, targets are all PK'd on the exact column(s) these indexed)
  // or a composite index that already covers the same leftmost columns
  // (online_sales/offline_sales (mmid, order_date), see schema.sql). Every extra
  // index costs write RU on every upload with zero query benefit.

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
