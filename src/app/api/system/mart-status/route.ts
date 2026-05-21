import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const [main, costIncentive] = await Promise.all([
      queryOne<{
        cnt: string
        min_date: string | null
        max_date: string | null
        last_refreshed: string | null
        attribution_days: string | null
        avg_days: string | null
      }>(`
        SELECT
          COUNT(*)                                                  AS cnt,
          MIN(order_date)::text                                     AS min_date,
          MAX(order_date)::text                                     AS max_date,
          MAX(refreshed_at)::text                                   AS last_refreshed,
          MODE() WITHIN GROUP (ORDER BY attribution_days)::text     AS attribution_days,
          ROUND(AVG(days_to_order), 1)::text                        AS avg_days
        FROM mart_table_main
      `),
      queryOne<{
        cnt: string
        min_month: string | null
        max_month: string | null
        last_refreshed: string | null
      }>(`
        SELECT
          COUNT(*)                              AS cnt,
          MIN(month)::text                      AS min_month,
          MAX(month)::text                      AS max_month,
          MAX(refreshed_at)::text               AS last_refreshed
        FROM mart_cost_incentive
      `),
    ])

    return NextResponse.json({
      mart_main: {
        row_count:        Number(main?.cnt ?? 0),
        min_date:         main?.min_date ?? null,
        max_date:         main?.max_date ?? null,
        last_refreshed:   main?.last_refreshed ?? null,
        attribution_days: main?.attribution_days ? Number(main.attribution_days) : null,
        avg_days_to_order: main?.avg_days ? Number(main.avg_days) : null,
      },
      cost_incentive: {
        row_count:      Number(costIncentive?.cnt ?? 0),
        min_month:      costIncentive?.min_month ?? null,
        max_month:      costIncentive?.max_month ?? null,
        last_refreshed: costIncentive?.last_refreshed ?? null,
      },
    })
  })
}
