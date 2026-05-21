import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    return NextResponse.json({
      mart_main: {
        row_count: 0,
        min_date: null,
        max_date: null,
        last_refreshed: null,
        attribution_days: null,
        avg_days_to_order: null,
      },
      cost_incentive: {
        row_count: 0,
        min_month: null,
        max_month: null,
        last_refreshed: null,
      },
    })
  })
}
