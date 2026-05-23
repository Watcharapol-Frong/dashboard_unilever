import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const rows = await query<{
      mmid:              string
      cust_name:         string | null
      lead_customers:    string
      contact_status:    string
      agent:             string | null
      dynamic_cmg:       string | null
      conversion_status: string
      hoc_orders:        string
      hoc_sales:         string
    }>(`
      WITH cs AS (
        SELECT mmid,
          CASE
            WHEN COUNT(*) FILTER (
              WHERE call_status NOT LIKE 'ไม่รับสาย%'
                AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
            ) > 0 THEN 'reached'
            ELSE 'called_not_reached'
          END AS contact_status,
          MAX(agent) AS agent
        FROM telesales_calls
        WHERE first_connected_date IS NOT NULL
        GROUP BY mmid
      ),
      os AS (
        SELECT mmid,
          COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention')) AS hoc_orders,
          COALESCE(SUM(sales_in_vat)   FILTER (WHERE customer_type IN ('new_customer','retention')), 0) AS hoc_sales,
          BOOL_OR(customer_type IN ('new_customer','retention')) AS is_converted,
          MAX(dynamic_cmg) AS dynamic_cmg
        FROM mart_telesales_orders
        GROUP BY mmid
      )
      SELECT
        l.mmid,
        l.cust_name,
        l.lead_customers,
        COALESCE(cs.contact_status, 'not_called') AS contact_status,
        cs.agent,
        os.dynamic_cmg,
        CASE
          WHEN os.is_converted      THEN 'converted'
          WHEN os.mmid IS NOT NULL  THEN 'not_converted'
          ELSE                           'no_hoc_order'
        END AS conversion_status,
        COALESCE(os.hoc_orders, 0) AS hoc_orders,
        COALESCE(os.hoc_sales,  0) AS hoc_sales
      FROM leads l
      LEFT JOIN cs ON cs.mmid = l.mmid
      LEFT JOIN os ON os.mmid = l.mmid
      ORDER BY l.lead_customers, l.mmid
    `)

    const data = rows.map(r => ({
      mmid:              r.mmid,
      cust_name:         r.cust_name ?? '',
      lead_customers:    r.lead_customers,
      contact_status:    r.contact_status,
      agent:             r.agent ?? null,
      dynamic_cmg:       r.dynamic_cmg ?? null,
      conversion_status: r.conversion_status,
      hoc_orders:        Number(r.hoc_orders),
      hoc_sales:         Number(r.hoc_sales),
    }))

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
