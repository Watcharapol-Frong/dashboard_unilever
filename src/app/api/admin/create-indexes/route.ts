import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return withAuth(async (_user, isAdmin) => {
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
    }

    const indexes = [
      {
        name: 'idx_telesales_calls_mmid_status_date',
        sql: `CREATE INDEX IF NOT EXISTS idx_telesales_calls_mmid_status_date
              ON telesales_calls(mmid, call_status, first_connected_date)`,
        desc: 'Optimize GROUP BY mmid + engagement classification'
      },
      {
        name: 'idx_mart_telesales_orders_mmid_cmg',
        sql: `CREATE INDEX IF NOT EXISTS idx_mart_telesales_orders_mmid_cmg
              ON mart_telesales_orders(mmid, primary_cmg)`,
        desc: 'Optimize segment/CMG filtering'
      },
      {
        name: 'idx_sales_hoc_orders_mmid_type',
        sql: `CREATE INDEX IF NOT EXISTS idx_sales_hoc_orders_mmid_type
              ON sales_hoc_orders(mmid, customer_type, channel)`,
        desc: 'Optimize order conversions lookup'
      }
    ]

    const results: Array<{ name: string; desc: string; status: 'success' | 'error'; message: string }> = []

    for (const idx of indexes) {
      try {
        await queryOne<{ }>(idx.sql, [])
        results.push({
          name: idx.name,
          desc: idx.desc,
          status: 'success',
          message: 'Index created or already exists'
        })
      } catch (err: any) {
        results.push({
          name: idx.name,
          desc: idx.desc,
          status: 'error',
          message: err.message || String(err)
        })
      }
    }

    const allSuccess = results.every(r => r.status === 'success')
    return NextResponse.json({
      ok: allSuccess,
      message: allSuccess ? 'All indexes created successfully' : 'Some indexes failed',
      results
    }, { status: allSuccess ? 200 : 206 })
  })
}
