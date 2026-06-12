import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { queryOne, query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const safe = async <T>(sql: string): Promise<T | null> => {
      try { return await queryOne<T>(sql) } catch { return null }
    }

    const [main, perf, builds] = await Promise.all([
      safe<{ cnt: string; min_date: string | null; max_date: string | null; last_refreshed: string | null; avg_days: string | null }>(`
        SELECT COUNT(*)           AS cnt,
               MIN(order_date)::text  AS min_date,
               MAX(order_date)::text  AS max_date,
               MAX(refreshed_at)::text AS last_refreshed,
               ROUND(AVG(days_to_order), 1)::text AS avg_days
        FROM sales_hoc_orders
      `),
      safe<{ cnt: string; min_month: string | null; max_month: string | null; last_refreshed: string | null }>(`
        SELECT COUNT(*)              AS cnt,
               MIN(month)::text      AS min_month,
               MAX(month)::text      AS max_month,
               MAX(refreshed_at)::text AS last_refreshed
        FROM mart_performance_cmg
      `),
      (async () => {
        try {
          return await query<{ id: string; started_at: string; finished_at: string | null; attribution_days: number | null; duration_ms: number | null; status: string; row_counts: Record<string, number> | null; error_message: string | null }>(`
            SELECT id::text, started_at::text, finished_at::text,
                   attribution_days, duration_ms, status, row_counts, error_message
            FROM mart_builds ORDER BY id DESC LIMIT 5
          `)
        } catch { return [] }
      })(),
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
      recent_builds: builds,
    })
    setCacheHeader(res, 'SHORT')
    return res
  })
}
