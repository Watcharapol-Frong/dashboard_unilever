import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Filter options never change between filter applications — cache for 1 hour
export async function GET() {
  return withAuth(async () => {
    const [rows, monthsRaw] = await Promise.all([
      query<{
        brands: string | null
        class_name: string | null
        senior_buyer_name: string | null
        buyer_name: string | null
        subclass: string | null
      }>(`
        SELECT DISTINCT brands, class_name, senior_buyer_name, buyer_name, subclass
        FROM products
        WHERE prod_num IN (SELECT DISTINCT prod_num FROM mart_telesales_orders)
        ORDER BY brands, class_name
      `),
      query<{ month: string }>(`
        SELECT DISTINCT month::text AS month FROM mart_telesales_orders ORDER BY month
      `),
    ])

    const unique = <T,>(arr: (T | null)[]) =>
      [...new Set(arr.filter((v): v is T => v !== null && v !== ''))]

    const res = NextResponse.json({
      ok: true,
      data: {
        brands:        unique(rows.map(r => r.brands)).sort(),
        class_names:   unique(rows.map(r => r.class_name)).sort(),
        senior_buyers: unique(rows.map(r => r.senior_buyer_name)).sort(),
        buyers:        unique(rows.map(r => r.buyer_name)).sort(),
        subclasses:    unique(rows.map(r => r.subclass)).sort(),
        months:        monthsRaw.map(r => r.month),
      },
    })
    res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
    return res
  })
}
