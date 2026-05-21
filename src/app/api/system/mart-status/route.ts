import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const [orders, costIncentive] = await Promise.all([
      queryOne<{
        cnt: string
        min_date: string | null
        max_date: string | null
        last_refreshed: string | null
      }>(`
        SELECT
          COUNT(*)                              AS cnt,
          MIN(order_date)::text                 AS min_date,
          MAX(order_date)::text                 AS max_date,
          MAX(refreshed_at)::text               AS last_refreshed
        FROM mart_telesales_orders
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
      telesales_orders: {
        row_count:      Number(orders?.cnt ?? 0),
        min_date:       orders?.min_date ?? null,
        max_date:       orders?.max_date ?? null,
        last_refreshed: orders?.last_refreshed ?? null,
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
