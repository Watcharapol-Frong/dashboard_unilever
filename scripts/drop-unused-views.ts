/**
 * One-off cleanup: drops sales_hoc_all / mart_performance_weekly, two views
 * from db/002_views.sql that predate the sales_hoc_orders mart table and are
 * never queried anywhere in the app.
 *
 * ensureSchemaExtensions() in src/lib/mart.ts already drops these on every
 * mart build (manual "Build Mart" click or auto-trigger after upload — there
 * is no nightly cron anymore), so this script is only useful to run it
 * immediately instead of waiting for the next build. Safe to run more than
 * once — DROP VIEW IF EXISTS.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/drop-unused-views.ts
 */
import { query } from '../src/lib/db'

const views = [
  { name: 'sales_hoc_all',           sql: `DROP VIEW IF EXISTS sales_hoc_all` },
  { name: 'mart_performance_weekly', sql: `DROP VIEW IF EXISTS mart_performance_weekly` },
]

async function dropUnusedViews() {
  console.log('Dropping unused views...\n')

  for (const v of views) {
    try {
      process.stdout.write(`  ${v.name} ... `)
      await query(v.sql)
      console.log('ok')
    } catch (err: unknown) {
      console.log(`SKIP (${(err as Error).message})`)
    }
  }

  console.log('\nDone.')
  process.exit(0)
}

dropUnusedViews().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
