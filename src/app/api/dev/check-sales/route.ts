import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [sample, totalRow, zeroRow, nullRow] = await Promise.all([
    query<{ order_number: string; order_date: string; sales_qty: number; sales_in_vat: number }>(
      `SELECT order_number, order_date::text, sales_qty, sales_in_vat FROM online_sales LIMIT 5`
    ),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM online_sales`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM online_sales WHERE sales_in_vat = 0`),
    queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM online_sales WHERE sales_in_vat IS NULL`),
  ])

  return NextResponse.json({
    total_rows: Number(totalRow?.cnt ?? 0),
    zero_sales_in_vat: Number(zeroRow?.cnt ?? 0),
    null_sales_in_vat: Number(nullRow?.cnt ?? 0),
    sample,
  })
}
