import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCSV(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
    return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'no_data\r\n'
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escapeCSV(r[h])).join(',')),
  ].join('\r\n')
}

function csvResponse(csv: string, filename: string) {
  return new NextResponse('﻿' + csv, {   // BOM for Excel UTF-8
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// ── Route ─────────────────────────────────────────────────────────────────────

const VALID_TYPES = ['overview', 'sales', 'telesales', 'leads', 'products', 'incentives'] as const
type ExportType = typeof VALID_TYPES[number]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params

  if (!VALID_TYPES.includes(type as ExportType)) {
    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 })
  }

  return withAdmin(async () => {
    const sp    = req.nextUrl.searchParams
    const start = sp.get('start') || null   // YYYY-MM (first of month)
    const end   = sp.get('end')   || null
    const cmg   = sp.get('cmg')   || null

    // Convert YYYY-MM to YYYY-MM-01 for DB comparison
    const startDate = start ? `${start}-01` : null
    const endDate   = end   ? `${end}-01`   : null

    const date = new Date().toISOString().slice(0, 10)
    const rows = await fetchRows(type as ExportType, startDate, endDate, cmg)
    return csvResponse(toCSV(rows), `${type}-${date}.csv`)
  })
}

async function fetchRows(
  type: ExportType,
  start: string | null,
  end: string | null,
  cmg: string | null
): Promise<Record<string, unknown>[]> {
  const where: string[] = []
  const p: (string | null)[] = []

  function addParam(val: string | null, clause: string) {
    if (!val) return
    p.push(val)
    where.push(clause.replace('?', `$${p.length}`))
  }

  switch (type) {
    case 'overview': {
      addParam(startDate(start), 'mp.month >= ?::date')
      addParam(startDate(end),   'mp.month <= ?::date')
      addParam(cmg,              'mp.dynamic_cmg = ?')
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      return query(`
        SELECT
          mp.month::text                          AS month,
          mp.month_label                          AS month_label,
          mp.dynamic_cmg                          AS cmg,
          mp.total_calls,
          mp.reached,
          mp.ordered,
          mp.new_customers,
          mp.retention,
          mp.hoc_orders,
          ROUND(mp.hoc_sales)::bigint             AS hoc_sales_thb,
          ROUND(mp.online_sales)::bigint          AS online_sales_thb,
          ROUND(mp.offline_sales)::bigint         AS offline_sales_thb,
          ROUND(mp.sales_target)::bigint          AS sales_target_thb,
          ROUND(mp.achievement_ratio * 100, 2)    AS achievement_pct,
          ROUND(mp.total_incentive)::bigint       AS total_incentive_thb,
          ROUND(mp.total_agent_cost)::bigint      AS total_agent_cost_thb,
          ROUND(mp.total_expense)::bigint         AS total_expense_thb,
          ROUND(mp.roi, 4)                        AS roi
        FROM mart_performance mp
        ${w}
        ORDER BY mp.month, mp.dynamic_cmg
      `, p)
    }

    case 'sales': {
      addParam(startDate(start), "DATE_TRUNC('month', s.order_date)::date >= ?::date")
      addParam(startDate(end),   "DATE_TRUNC('month', s.order_date)::date <= ?::date")
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      return query(`
        SELECT
          s.order_number,
          s.order_date::text          AS order_date,
          s.month::text               AS month,
          s.mmid,
          s.prod_num,
          s.dynamic_cmg               AS cmg,
          s.channel,
          s.sales_qty,
          ROUND(s.sales_in_vat)::bigint AS sales_thb
        FROM sales_hoc_all s
        ${w}
        ORDER BY s.order_date DESC
        LIMIT 100000
      `, p)
    }

    case 'telesales': {
      addParam(startDate(start), "DATE_TRUNC('month', tc.first_connected_date)::date >= ?::date")
      addParam(startDate(end),   "DATE_TRUNC('month', tc.first_connected_date)::date <= ?::date")
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      return query(`
        SELECT
          tc.mmid,
          tc.agent,
          tc.lead_customers               AS tier,
          tc.call_status,
          tc.reason_group,
          tc.reason_subgroup,
          tc.first_connected_date::text   AS call_date,
          tc.contact_note
        FROM telesales_calls tc
        ${w}
        ORDER BY tc.first_connected_date DESC NULLS LAST
        LIMIT 100000
      `, p)
    }

    case 'leads': {
      addParam(cmg, 'os.dynamic_cmg = ?')
      const w = where.length ? `AND ${where.join(' AND ')}` : ''
      return query(`
        WITH cs AS (
          SELECT
            mmid,
            MAX(agent) AS agent,
            CASE
              WHEN COUNT(*) FILTER (
                WHERE call_status NOT LIKE 'ไม่รับสาย%'
                  AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
              ) > 0 THEN 'reached'
              WHEN COUNT(*) > 0 THEN 'called_not_reached'
              ELSE 'not_called'
            END AS contact_status
          FROM telesales_calls
          WHERE first_connected_date IS NOT NULL
          GROUP BY mmid
        ),
        os AS (
          SELECT
            mmid,
            MAX(dynamic_cmg)  AS dynamic_cmg,
            COUNT(DISTINCT order_number) FILTER (WHERE customer_type IN ('new_customer','retention')) AS hoc_orders,
            ROUND(SUM(sales_in_vat) FILTER (WHERE customer_type IN ('new_customer','retention')))::bigint AS hoc_sales,
            BOOL_OR(customer_type IN ('new_customer','retention')) AS is_converted
          FROM mart_telesales_orders
          GROUP BY mmid
        )
        SELECT
          l.mmid,
          l.cust_name,
          l.lead_customers                                   AS tier,
          COALESCE(cs.contact_status, 'not_called')          AS contact_status,
          cs.agent,
          os.dynamic_cmg                                     AS cmg,
          CASE
            WHEN os.is_converted THEN 'converted'
            WHEN os.mmid IS NOT NULL THEN 'not_converted'
            ELSE 'no_hoc_order'
          END                                                AS conversion_status,
          COALESCE(os.hoc_orders, 0)                        AS hoc_orders,
          COALESCE(os.hoc_sales, 0)                         AS hoc_sales_thb
        FROM leads l
        LEFT JOIN cs ON cs.mmid = l.mmid
        LEFT JOIN os ON os.mmid = l.mmid
        WHERE TRUE ${w}
        ORDER BY l.mmid
        LIMIT 100000
      `, p)
    }

    case 'products': {
      addParam(startDate(start), 's.month >= ?::date')
      addParam(startDate(end),   's.month <= ?::date')
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      return query(`
        SELECT
          COALESCE(p.prod_num, s.prod_num)    AS prod_num,
          p.brands,
          p.product_name_th,
          p.is_uni_hoc_pd,
          COUNT(DISTINCT s.order_number)      AS order_count,
          SUM(s.sales_qty)                    AS total_qty,
          ROUND(SUM(s.sales_in_vat))::bigint  AS total_sales_thb
        FROM sales_hoc_all s
        LEFT JOIN products p ON p.prod_num = s.prod_num
        ${w}
        GROUP BY COALESCE(p.prod_num, s.prod_num), p.brands, p.product_name_th, p.is_uni_hoc_pd
        ORDER BY total_sales_thb DESC
      `, p)
    }

    case 'incentives': {
      addParam(startDate(start), 'month >= ?::date')
      addParam(startDate(end),   'month <= ?::date')
      addParam(cmg,              'dynamic_cmg = ?')
      const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
      return query(`
        SELECT
          month::text                             AS month,
          dynamic_cmg                             AS cmg,
          ROUND(hoc_sales)::bigint                AS hoc_sales_thb,
          ROUND(sales_target)::bigint             AS sales_target_thb,
          ROUND(achievement_ratio * 100, 2)       AS achievement_pct,
          ROUND(total_incentive)::bigint          AS total_incentive_thb,
          ROUND(total_agent_cost)::bigint         AS total_agent_cost_thb,
          ROUND(total_expense)::bigint            AS total_expense_thb,
          ROUND(roi, 4)                           AS roi
        FROM mart_performance
        ${w}
        ORDER BY month, dynamic_cmg
      `, p)
    }
  }
}

function startDate(val: string | null): string | null {
  return val
}
