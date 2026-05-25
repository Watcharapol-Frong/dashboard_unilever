import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await queryOne<{
    max_date: string | null
    last_refreshed: string | null
  }>(`
    SELECT
      MAX(order_date)::text    AS max_date,
      MAX(refreshed_at)::text  AS last_refreshed
    FROM mart_telesales_orders
  `)

  return NextResponse.json({
    ok: true,
    max_date:       row?.max_date       ?? null,
    last_refreshed: row?.last_refreshed ?? null,
  })
}
