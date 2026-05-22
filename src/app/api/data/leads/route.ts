import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Returns leads aggregated by (lead_customers, contact_status, conversion_status).
 *
 * contact_status:
 *   'not_called'         — mmid exists in leads but not in telesales_calls
 *   'called_not_reached' — telesales_calls record exists, call_status != 'รับสาย'
 *   'reached'            — call_status = 'รับสาย'
 *
 * conversion_status (from mart_telesales_orders):
 *   'new_customer'  — placed HOC order within attribution window, first-ever order
 *   'retention'     — placed HOC order within attribution window, repeat order
 *   'not_converted' — has telesales record but only outside-window orders
 *   'no_hoc_order'  — no matching row in mart_telesales_orders
 *
 * Max rows ≈ lead_tiers × 3 × 4 (very compact — suitable for full client-side filtering).
 */
export async function GET() {
  return withAdmin(async () => {
    const rows = await query<{
      lead_customers: string
      contact_status: string
      conversion_status: string
      lead_count: string
      hoc_sales: string
      avg_days_to_first_order: string | null
    }>(`
      WITH call_status AS (
        SELECT
          l.mmid,
          l.lead_customers,
          CASE
            WHEN tc.mmid IS NULL          THEN 'not_called'
            WHEN tc.call_status = 'รับสาย' THEN 'reached'
            ELSE                               'called_not_reached'
          END AS contact_status
        FROM leads l
        LEFT JOIN telesales_calls tc ON tc.mmid = l.mmid
      ),
      order_stats AS (
        SELECT
          mmid,
          BOOL_OR(customer_type = 'new_customer')                                         AS is_new,
          BOOL_OR(customer_type = 'retention')                                             AS is_retention,
          BOOL_OR(customer_type IN ('first_order_not_converted','retention_not_converted')) AS is_not_converted,
          COALESCE(SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer','retention')), 0) AS hoc_sales,
          MIN(days_to_order) FILTER (WHERE customer_type = 'new_customer')                AS days_to_first_order
        FROM mart_telesales_orders
        GROUP BY mmid
      ),
      combined AS (
        SELECT
          cs.lead_customers,
          cs.contact_status,
          CASE
            WHEN os.is_new            THEN 'new_customer'
            WHEN os.is_retention      THEN 'retention'
            WHEN os.is_not_converted  THEN 'not_converted'
            ELSE                           'no_hoc_order'
          END AS conversion_status,
          COALESCE(os.hoc_sales, 0)        AS hoc_sales,
          os.days_to_first_order
        FROM call_status cs
        LEFT JOIN order_stats os ON os.mmid = cs.mmid
      )
      SELECT
        lead_customers,
        contact_status,
        conversion_status,
        COUNT(*)                                           AS lead_count,
        SUM(hoc_sales)                                    AS hoc_sales,
        ROUND(AVG(days_to_first_order), 1)                AS avg_days_to_first_order
      FROM combined
      GROUP BY lead_customers, contact_status, conversion_status
      ORDER BY lead_customers, contact_status, conversion_status
    `)

    const data = rows.map(r => ({
      lead_customers:          r.lead_customers,
      contact_status:          r.contact_status,
      conversion_status:       r.conversion_status,
      lead_count:              Number(r.lead_count),
      hoc_sales:               Number(r.hoc_sales ?? 0),
      avg_days_to_first_order: r.avg_days_to_first_order !== null ? Number(r.avg_days_to_first_order) : null,
    }))

    const res = NextResponse.json({ ok: true, data })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
