import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const safeQuery = async <T>(sql: string): Promise<T | null> => {
      try { return await queryOne<T>(sql) }
      catch { return null }
    }

    const [main, perf] = await Promise.all([
      safeQuery<{ cnt: string; min_date: string | null; max_date: string | null; last_refreshed: string | null; avg_days: string | null }>(`
        SELECT COUNT(*) AS cnt, MIN(order_date)::text AS min_date, MAX(order_date)::text AS max_date,
               MAX(refreshed_at)::text AS last_refreshed, ROUND(AVG(days_to_order), 1)::text AS avg_days
        FROM mart_telesales_orders
      `),
      safeQuery<{ cnt: string; min_month: string | null; max_month: string | null; last_refreshed: string | null }>(`
        SELECT COUNT(*) AS cnt, MIN(month)::text AS min_month, MAX(month)::text AS max_month,
               MAX(refreshed_at)::text AS last_refreshed
        FROM mart_performance_cmg
      `),
    ])

    const res = NextResponse.json({
      mart_main: {
        row_count:         Number(main?.cnt ?? 0),
        min_date:          main?.min_date ?? null,
        max_date:          main?.max_date ?? null,
        last_refreshed:    main?.last_refreshed ?? null,
        avg_days_to_order: main?.avg_days ? Number(main.avg_days) : null,
      },
      performance: {
        row_count:      Number(perf?.cnt ?? 0),
        min_month:      perf?.min_month ?? null,
        max_month:      perf?.max_month ?? null,
        last_refreshed: perf?.last_refreshed ?? null,
      },
    })
    res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
    return res
  })
}
