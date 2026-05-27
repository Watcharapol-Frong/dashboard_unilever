import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Interval = 'daily' | 'weekly' | 'monthly'

function periodExpr(interval: Interval) {
  if (interval === 'daily')  return 'order_date'
  if (interval === 'weekly') return "DATE_TRUNC('week', order_date)::date"
  return 'month'
}

function labelExpr(interval: Interval) {
  if (interval === 'daily')  return "TO_CHAR(order_date, 'DD Mon')"
  if (interval === 'weekly') return 'MAX(week_label)'
  return "MAX(month_label) || ' ' || EXTRACT(YEAR FROM MAX(order_date))::text"
}

function buildWhere(
  startDate: string | null,
  endDate: string | null,
  channel: string[],
  cmg: string[],
  agent: string[],
  conversion: string,
) {
  const conditions: string[] = []
  const params: any[] = []

  if (startDate) { params.push(startDate); conditions.push(`order_date >= $${params.length}::date`) }
  if (endDate)   { params.push(endDate);   conditions.push(`order_date <= $${params.length}::date`) }
  if (channel.length > 0) { params.push(channel); conditions.push(`channel = ANY($${params.length})`) }
  if (cmg.length > 0)     { params.push(cmg);     conditions.push(`dynamic_cmg = ANY($${params.length})`) }
  if (agent.length > 0)   { params.push(agent);   conditions.push(`agent = ANY($${params.length})`) }
  if (conversion === 'converted') {
    conditions.push(`customer_type IN ('new_customer', 'retention')`)
  } else if (conversion === 'not_converted') {
    conditions.push(`customer_type IN ('first_order_not_converted', 'retention_not_converted')`)
  }
  return { where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '', params }
}

async function fetchKpis(where: string, params: any[]) {
  return queryOne<{
    total_sales: string; online_sales: string; offline_sales: string
    total_orders: string; new_customers: string; retention_customers: string; total_qty: string
  }>(`
    SELECT
      COALESCE(SUM(sales_in_vat), 0)::text                                                       AS total_sales,
      COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END), 0)::text           AS online_sales,
      COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END), 0)::text           AS offline_sales,
      COUNT(DISTINCT order_number)::text                                                          AS total_orders,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','first_order_not_converted'))::text AS new_customers,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('retention','retention_not_converted'))::text       AS retention_customers,
      COALESCE(SUM(sales_qty), 0)::text                                                          AS total_qty
    FROM sales_hoc_orders
    ${where}
  `, params)
}

// Returns last 2 complete periods (most-recent first) — full KPI fields for each
async function fetchLastTwoPeriods(interval: Interval, where: string, params: any[]) {
  const grp = periodExpr(interval)
  const lbl = labelExpr(interval)
  return query<{
    period: string; period_label: string
    total_sales: string; online_sales: string; offline_sales: string
    total_orders: string; new_customers: string; retention_customers: string; total_qty: string
  }>(`
    SELECT
      ${grp} AS period,
      ${lbl} AS period_label,
      COALESCE(SUM(sales_in_vat), 0)::text                                                       AS total_sales,
      COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END), 0)::text           AS online_sales,
      COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END), 0)::text           AS offline_sales,
      COUNT(DISTINCT order_number)::text                                                          AS total_orders,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','first_order_not_converted'))::text AS new_customers,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('retention','retention_not_converted'))::text       AS retention_customers,
      COALESCE(SUM(sales_qty), 0)::text                                                          AS total_qty
    FROM sales_hoc_orders
    ${where}
    GROUP BY ${grp}
    ORDER BY ${grp} DESC
    LIMIT 2
  `, params)
}

const cmpRatio = (curr: number, prev: number) => prev > 0 ? (curr - prev) / prev : null

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const rawInterval = searchParams.get('interval') ?? 'monthly'
    const interval: Interval =
      rawInterval === 'daily' ? 'daily' : rawInterval === 'weekly' ? 'weekly' : 'monthly'
    const startDate  = searchParams.get('startDate')
    const endDate    = searchParams.get('endDate')
    const channel    = (searchParams.get('channel') || '').split(',').filter(Boolean)
    const cmg        = (searchParams.get('cmg')     || '').split(',').filter(Boolean)
    const agent      = (searchParams.get('agent')   || '').split(',').filter(Boolean)
    const conversion = searchParams.get('conversion') || 'all'

    const hasDateRange = !!(startDate && endDate)

    // Filters without date (for trend and for no-range KPI)
    const noDate = buildWhere(null, null, channel, cmg, agent, conversion)
    // Filters with date (for date-range KPI & trend)
    const curr = buildWhere(startDate, endDate, channel, cmg, agent, conversion)

    // Trend uses full date range when provided
    const trendFilter = hasDateRange ? curr : noDate
    const grpBy = periodExpr(interval)
    const lbl   = labelExpr(interval)

    // Previous period for explicit date range
    let prevWhere: ReturnType<typeof buildWhere> | null = null
    let comparisonLabel: string | null = null
    if (hasDateRange) {
      const s = new Date(startDate!)
      const e = new Date(endDate!)
      const durMs = e.getTime() - s.getTime()
      const pe = new Date(s.getTime() - 86_400_000)
      const ps = new Date(pe.getTime() - durMs)
      prevWhere = buildWhere(
        ps.toISOString().split('T')[0],
        pe.toISOString().split('T')[0],
        channel, cmg, agent, conversion,
      )
      comparisonLabel = 'vs preceding period'
    } else {
      comparisonLabel = interval === 'weekly' ? 'vs previous week' : 'vs previous month'
    }

    const [currKpiOrNull, prevOrPeriods, periodsRaw, ordersRaw, optsRaw, monthsRaw] = await Promise.all([
      // Current KPI: date-filtered when range provided; null when no range (will use r0 instead)
      hasDateRange ? fetchKpis(curr.where, curr.params) : Promise.resolve(null),

      // Comparison: explicit prev period (date range) OR last 2 periods (no range)
      hasDateRange && prevWhere
        ? fetchKpis(prevWhere.where, prevWhere.params)
        : fetchLastTwoPeriods(interval, noDate.where, noDate.params),

      // Trend data
      query<{ period: string; period_label: string; online: string; offline: string }>(`
        SELECT
          ${grpBy} AS period,
          ${lbl}   AS period_label,
          COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END), 0)::text AS online,
          COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END), 0)::text AS offline
        FROM sales_hoc_orders
        ${trendFilter.where}
        GROUP BY ${grpBy}
        ORDER BY ${grpBy}
      `, trendFilter.params),

      // Recent orders
      query<{
        order_number: string; order_date: string; mmid: string; prod_num: string
        sales_qty: string; sales_in_vat: string; dynamic_cmg: string
        channel: string; agent: string; customer_type: string
      }>(`
        SELECT order_number, order_date::text, mmid, prod_num,
               sales_qty::text, sales_in_vat::text, dynamic_cmg,
               channel, agent, customer_type
        FROM sales_hoc_orders
        ${curr.where}
        ORDER BY order_date DESC, order_number DESC
        LIMIT 100
      `, curr.params),

      // Unfiltered filter options
      query<{ cmg: string; agent: string }>(`
        SELECT DISTINCT dynamic_cmg AS cmg, agent
        FROM sales_hoc_orders
        WHERE dynamic_cmg IS NOT NULL AND agent IS NOT NULL
        ORDER BY dynamic_cmg, agent
      `),

      // Available months for range chips (unfiltered)
      query<{ month: string }>(`
        SELECT DISTINCT month::text AS month FROM sales_hoc_orders ORDER BY month
      `),
    ])

    // ── Parse current KPI ───────────────────────────────────────────────────────
    // hasDateRange  → use fetchKpis result (date-scoped)
    // !hasDateRange → use r0 (latest complete period) for consistency: KPI value & % badge same period
    type KpiRow = { total_sales: number; online_sales: number; offline_sales: number; total_orders: number; new_customers: number; retention_customers: number; total_qty: number }

    let c: KpiRow
    let currentPeriodLabel: string | null = null
    let previousPeriodLabel: string | null = null

    if (hasDateRange) {
      const kp = currKpiOrNull as Awaited<ReturnType<typeof fetchKpis>>
      c = {
        total_sales:         Number(kp?.total_sales         ?? 0),
        online_sales:        Number(kp?.online_sales        ?? 0),
        offline_sales:       Number(kp?.offline_sales       ?? 0),
        total_orders:        Number(kp?.total_orders        ?? 0),
        new_customers:       Number(kp?.new_customers       ?? 0),
        retention_customers: Number(kp?.retention_customers ?? 0),
        total_qty:           Number(kp?.total_qty           ?? 0),
      }
    } else {
      const rows = prevOrPeriods as Awaited<ReturnType<typeof fetchLastTwoPeriods>>
      const r0 = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
      c = {
        total_sales:         Number(r0?.total_sales         ?? 0),
        online_sales:        Number(r0?.online_sales        ?? 0),
        offline_sales:       Number(r0?.offline_sales       ?? 0),
        total_orders:        Number(r0?.total_orders        ?? 0),
        new_customers:       Number(r0?.new_customers       ?? 0),
        retention_customers: Number(r0?.retention_customers ?? 0),
        total_qty:           Number(r0?.total_qty           ?? 0),
      }
      currentPeriodLabel = r0?.period_label ?? null
      previousPeriodLabel = rows.length >= 2 ? (rows[1].period_label ?? null) : null
    }

    const avgOV = c.total_orders > 0 ? c.total_sales / c.total_orders : 0

    // ── Parse comparison ────────────────────────────────────────────────────────
    let cmpSales: number | null = null
    let cmpOrders: number | null = null
    let cmpNew: number | null = null
    let cmpRetention: number | null = null
    let cmpAov: number | null = null

    if (hasDateRange) {
      const p = prevOrPeriods as Awaited<ReturnType<typeof fetchKpis>>
      if (p) {
        const ps   = Number(p.total_sales        ?? 0)
        const po   = Number(p.total_orders       ?? 0)
        const pn   = Number(p.new_customers      ?? 0)
        const pr   = Number(p.retention_customers ?? 0)
        const paov = po > 0 ? ps / po : 0
        cmpSales     = cmpRatio(c.total_sales,        ps)
        cmpOrders    = cmpRatio(c.total_orders,       po)
        cmpNew       = cmpRatio(c.new_customers,      pn)
        cmpRetention = cmpRatio(c.retention_customers, pr)
        cmpAov       = cmpRatio(avgOV,                paov)
      }
    } else {
      const rows = prevOrPeriods as Awaited<ReturnType<typeof fetchLastTwoPeriods>>
      if (Array.isArray(rows) && rows.length >= 2) {
        const r1   = rows[1]
        const ps   = Number(r1.total_sales         ?? 0)
        const po   = Number(r1.total_orders        ?? 0)
        const pn   = Number(r1.new_customers       ?? 0)
        const pr   = Number(r1.retention_customers ?? 0)
        const paov = po > 0 ? ps / po : 0
        cmpSales     = cmpRatio(c.total_sales,        ps)
        cmpOrders    = cmpRatio(c.total_orders,       po)
        cmpNew       = cmpRatio(c.new_customers,      pn)
        cmpRetention = cmpRatio(c.retention_customers, pr)
        cmpAov       = cmpRatio(avgOV,                paov)
      }
    }

    const res = NextResponse.json({
      ok: true,
      data: {
        kpi: {
          ...c,
          avg_order_value: avgOV,
          cmp_total_sales:         cmpSales,
          cmp_total_orders:        cmpOrders,
          cmp_new_customers:       cmpNew,
          cmp_retention_customers: cmpRetention,
          cmp_avg_order_value:     cmpAov,
          comparison_label:        comparisonLabel,
          current_period_label:    currentPeriodLabel,
          previous_period_label:   previousPeriodLabel,
        },
        by_period: periodsRaw.map(r => ({
          period:       r.period,
          period_label: r.period_label,
          online:       Number(r.online),
          offline:      Number(r.offline),
          total:        Number(r.online) + Number(r.offline),
        })),
        recent_orders: ordersRaw.map(o => ({
          order_number: o.order_number,
          order_date:   o.order_date,
          mmid:         o.mmid,
          prod_num:     o.prod_num,
          sales_qty:    Number(o.sales_qty),
          sales_in_vat: Number(o.sales_in_vat),
          dynamic_cmg:  o.dynamic_cmg,
          channel:      o.channel === 'online' ? 'Online' : 'Offline',
          agent:        o.agent,
          customer_type: o.customer_type,
        })),
        options: {
          cmg:    [...new Set(optsRaw.map(o => o.cmg))].filter(Boolean).sort(),
          agents: [...new Set(optsRaw.map(o => o.agent))].filter(Boolean).sort(),
        },
        months: monthsRaw.map(r => r.month),
      },
    })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
