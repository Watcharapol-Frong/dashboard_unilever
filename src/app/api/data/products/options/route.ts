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
        SELECT DISTINCT m.brands, m.class_name, p.senior_buyer_name, p.buyer_name, m.subclass
        FROM sales_hoc_orders m
        LEFT JOIN products p ON m.prod_num = p.prod_num
        ORDER BY m.brands, m.class_name
      `),
      query<{ month: string }>(`
        SELECT DISTINCT month::text AS month FROM sales_hoc_orders ORDER BY month
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
