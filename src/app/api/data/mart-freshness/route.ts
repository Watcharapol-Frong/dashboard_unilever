import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [freshness, meta] = await Promise.all([
    queryOne<{ max_date: string | null; last_refreshed: string | null }>(`
      SELECT
        MAX(order_date)::text   AS max_date,
        MAX(refreshed_at)::text AS last_refreshed
      FROM sales_hoc_orders
    `),
    queryOne<{ attribution_days: string | null }>(`
      SELECT attribution_days::text FROM mart_performance_month LIMIT 1
    `).catch(() => null),
  ])

  const res = NextResponse.json({
    ok: true,
    max_date:         freshness?.max_date         ?? null,
    last_refreshed:   freshness?.last_refreshed   ?? null,
    attribution_days: meta?.attribution_days ? Number(meta.attribution_days) : null,
  })
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  return res
}
