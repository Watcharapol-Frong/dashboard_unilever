import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAuth(async () => {
    const safeQuery = async <T>(sql: string, params?: unknown[]) => {
      try { return await queryOne<T>(sql, params) } catch { return null }
    }

    // This endpoint is polled every 5 min per open tab (FreshnessBar) and every
    // 20s during an active build (BuildContext) — read the PK lookup in
    // table_summaries (kept in sync by refreshTableSummaries() on every mart
    // build) instead of an aggregate scan of sales_hoc_orders on every call.
    const [freshness, meta, lastBuild] = await Promise.all([
      safeQuery<{ max_date: string | null; last_refreshed: string | null }>(`
        SELECT max_date::text AS max_date, last_updated::text AS last_refreshed
        FROM table_summaries WHERE table_name = 'sales_hoc_orders'
      `),
      safeQuery<{ attribution_days: string | null }>(`
        SELECT attribution_days::text FROM mart_performance_month LIMIT 1
      `),
      safeQuery<{ status: string; finished_at: string | null; duration_ms: number | null }>(`
        SELECT status, finished_at::text, duration_ms
        FROM mart_builds ORDER BY id DESC LIMIT 1
      `),
    ])

    const res = NextResponse.json({
      ok: true,
      max_date:         freshness?.max_date         ?? null,
      last_refreshed:   freshness?.last_refreshed   ?? null,
      attribution_days: meta?.attribution_days ? Number(meta.attribution_days) : null,
      last_build:       lastBuild ?? null,
    })
    setCacheHeader(res, 'SHORT')
    return res
  })
}
