/**
 * Standalone mart build script — runs outside Next.js/Vercel, no timeout limit.
 * Used by: GitHub Actions nightly cron, local development, manual on-demand.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/build-mart.ts
 *   ATTRIBUTION_DAYS=14 DATABASE_URL=... npx tsx scripts/build-mart.ts
 */
import { refreshAllMarts } from '../src/lib/mart'

const attributionDays = Math.max(1, Math.min(365, Number(process.env.ATTRIBUTION_DAYS ?? 30)))

console.log(`[build-mart] Starting — attribution window: ${attributionDays} days`)
const t0 = Date.now()

refreshAllMarts(attributionDays)
  .then(({ mart_main, performance, funnel }) => {
    const ms = Date.now() - t0
    console.log(`[build-mart] Done in ${(ms / 1000).toFixed(1)}s`)
    console.log(`  sales_hoc_orders:      ${mart_main} rows`)
    console.log(`  mart_telesales_funnel: ${funnel} rows`)
    console.log(`  mart_performance_cmg:  ${performance} rows`)
    process.exit(0)
  })
  .catch(err => {
    console.error('[build-mart] FAILED:', err)
    process.exit(1)
  })
