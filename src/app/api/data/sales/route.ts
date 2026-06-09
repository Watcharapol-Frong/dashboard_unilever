import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { addDateRange, addFilter, toWhere, setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

type Interval = 'daily' | 'weekly' | 'monthly'

const CONV     = "customer_type IN ('new_customer','retention')"
const NOT_CONV = "customer_type IN ('first_order_not_converted','retention_not_converted')"

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
) {
  const conditions: string[] = []
  const params: any[] = []

  addDateRange(params, conditions, startDate, endDate)
  addFilter(params, conditions, channel, 'channel')
  addFilter(params, conditions, cmg, 'dynamic_cmg')
  addFilter(params, conditions, agent, 'agent')
  return { where: toWhere(conditions), params }
}

async function fetchKpis(where: string, params: any[]) {
  return queryOne<{
    total_sales: string; total_online: string; total_offline: string
    total_orders: string; total_qty: string
    converted_sales: string; converted_online: string; converted_offline: string
    converted_orders: string; new_customers: string; retention_customers: string
    not_converted_sales: string; not_converted_online: string; not_converted_offline: string
    not_converted_orders: string
  }>(`
    SELECT
      COALESCE(SUM(sales_in_vat), 0)::text                                                                         AS total_sales,
      COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END), 0)::text                             AS total_online,
      COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END), 0)::text                             AS total_offline,
      COUNT(DISTINCT order_number)::text                                                                            AS total_orders,
      COALESCE(SUM(sales_qty), 0)::text                                                                            AS total_qty,

      COALESCE(SUM(sales_in_vat)             FILTER (WHERE ${CONV}), 0)::text                                      AS converted_sales,
      COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${CONV}), 0)::text     AS converted_online,
      COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${CONV}), 0)::text     AS converted_offline,
      COUNT(DISTINCT order_number)           FILTER (WHERE ${CONV})::text                                          AS converted_orders,
      COUNT(DISTINCT mmid)                   FILTER (WHERE customer_type = 'new_customer')::text                   AS new_customers,
      COUNT(DISTINCT mmid)                   FILTER (WHERE customer_type = 'retention')::text                      AS retention_customers,

      COALESCE(SUM(sales_in_vat)             FILTER (WHERE ${NOT_CONV}), 0)::text                                  AS not_converted_sales,
      COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${NOT_CONV}), 0)::text AS not_converted_online,
      COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${NOT_CONV}), 0)::text AS not_converted_offline,
      COUNT(DISTINCT order_number)           FILTER (WHERE ${NOT_CONV})::text                                      AS not_converted_orders
    FROM sales_hoc_orders
    ${where}
  `, params)
}

// Returns last 2 complete periods (most-recent first) — period + period_label + converted_sales for scope
async function fetchLastTwoPeriods(interval: Interval, where: string, params: any[]) {
  const grp = periodExpr(interval)
  const lbl = labelExpr(interval)
  return query<{
    period: string; period_label: string; converted_sales: string
  }>(`
    SELECT
      (${grp})::text AS period,
      ${lbl}         AS period_label,
      COALESCE(SUM(sales_in_vat) FILTER (WHERE ${CONV}), 0)::text AS converted_sales
    FROM sales_hoc_orders
    ${where}
    GROUP BY ${grp}
    ORDER BY ${grp} DESC
    LIMIT 2
  `, params)
}

// Given r0.period and interval, return the [start, end] order_date boundaries of that period
function periodBoundaries(period: string, interval: Interval): [string, string] {
  if (interval === 'monthly') {
    const [y, m] = period.split('-').map(Number)
    const lastDay = new Date(y, m, 0).toISOString().split('T')[0]
    return [period, lastDay]
  }
  if (interval === 'weekly') {
    const end = new Date(new Date(period).getTime() + 6 * 86_400_000).toISOString().split('T')[0]
    return [period, end]
  }
  return [period, period] // daily
}

const cmpRatio = (curr: number, prev: number) => prev > 0 ? (curr - prev) / prev : null

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const rawInterval = searchParams.get('interval') ?? 'monthly'
    const interval: Interval =
      rawInterval === 'daily' ? 'daily' : rawInterval === 'weekly' ? 'weekly' : 'monthly'
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const channel   = (searchParams.get('channel') || '').split(',').filter(Boolean)
    const cmg       = (searchParams.get('cmg')     || '').split(',').filter(Boolean)
    const agent     = (searchParams.get('agent')   || '').split(',').filter(Boolean)

    const hasDateRange = !!(startDate && endDate)

    const noDate = buildWhere(null, null, channel, cmg, agent)
    const curr   = buildWhere(startDate, endDate, channel, cmg, agent)

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
        channel, cmg, agent,
      )
      comparisonLabel = 'vs preceding period'
    } else {
      comparisonLabel = interval === 'weekly' ? 'vs previous week' : 'vs previous month'
    }

    // ── Phase 1 (no date range): pre-fetch latest 2 periods ──────────────────
    let preloadedPeriods: Awaited<ReturnType<typeof fetchLastTwoPeriods>> | null = null
    let trendFilter = hasDateRange ? curr : noDate

    if (!hasDateRange) {
      preloadedPeriods = await fetchLastTwoPeriods(interval, noDate.where, noDate.params)
      const r0 = preloadedPeriods[0]
      if (r0) {
        const [ps, pe] = periodBoundaries(r0.period, interval)
        trendFilter = buildWhere(ps, pe, channel, cmg, agent)
      }
    }

    // ── Phase 2: Fetch all remaining data in parallel ─────────────────────────
    const [currKpiOrNull, prevKpi, periodsRaw, cmgOptsRaw, agentOptsRaw, monthsRaw] = await Promise.all([
      // Current KPI: date-scoped when range provided; null when no range (use preloaded scope)
      hasDateRange
        ? fetchKpis(curr.where, curr.params)
        : fetchKpis(trendFilter.where, trendFilter.params),

      // Previous KPI: only needed for date-range comparison
      hasDateRange && prevWhere
        ? fetchKpis(prevWhere.where, prevWhere.params)
        : Promise.resolve(null),

      // Trend — per-period breakdown for all groups
      query<{
        period: string; period_label: string
        total_online: string; total_offline: string
        converted_online: string; converted_offline: string
        not_converted_online: string; not_converted_offline: string
      }>(`
        SELECT
          (${grpBy})::text AS period,
          ${lbl}           AS period_label,
          COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END), 0)::text                             AS total_online,
          COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END), 0)::text                             AS total_offline,
          COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${CONV}), 0)::text     AS converted_online,
          COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${CONV}), 0)::text     AS converted_offline,
          COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${NOT_CONV}), 0)::text AS not_converted_online,
          COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END) FILTER (WHERE ${NOT_CONV}), 0)::text AS not_converted_offline
        FROM sales_hoc_orders
        ${trendFilter.where}
        GROUP BY ${grpBy}
        ORDER BY ${grpBy}
      `, trendFilter.params),

      // Filter options — separate queries so CMG list is not limited to rows with non-null agents
      query<{ cmg: string }>(`
        SELECT DISTINCT dynamic_cmg AS cmg
        FROM sales_hoc_orders
        WHERE dynamic_cmg IS NOT NULL
        ORDER BY dynamic_cmg
      `),
      query<{ agent: string }>(`
        SELECT DISTINCT agent
        FROM sales_hoc_orders
        WHERE agent IS NOT NULL
        ORDER BY agent
      `),

      // Available months for chips (unfiltered)
      query<{ month: string }>(`
        SELECT DISTINCT month::text AS month FROM sales_hoc_orders ORDER BY month
      `),
    ])

    // ── Parse current KPI ─────────────────────────────────────────────────────
    type KpiRow = {
      total_sales: number; total_online: number; total_offline: number
      total_orders: number; total_qty: number
      converted_sales: number; converted_online: number; converted_offline: number
      converted_orders: number; new_customers: number; retention_customers: number
      not_converted_sales: number; not_converted_online: number; not_converted_offline: number
      not_converted_orders: number
    }

    let currentPeriodLabel: string | null = null
    let previousPeriodLabel: string | null = null

    const kp = currKpiOrNull
    const c: KpiRow = {
      total_sales:           Number(kp?.total_sales           ?? 0),
      total_online:          Number(kp?.total_online          ?? 0),
      total_offline:         Number(kp?.total_offline         ?? 0),
      total_orders:          Number(kp?.total_orders          ?? 0),
      total_qty:             Number(kp?.total_qty             ?? 0),
      converted_sales:       Number(kp?.converted_sales       ?? 0),
      converted_online:      Number(kp?.converted_online      ?? 0),
      converted_offline:     Number(kp?.converted_offline     ?? 0),
      converted_orders:      Number(kp?.converted_orders      ?? 0),
      new_customers:         Number(kp?.new_customers         ?? 0),
      retention_customers:   Number(kp?.retention_customers   ?? 0),
      not_converted_sales:   Number(kp?.not_converted_sales   ?? 0),
      not_converted_online:  Number(kp?.not_converted_online  ?? 0),
      not_converted_offline: Number(kp?.not_converted_offline ?? 0),
      not_converted_orders:  Number(kp?.not_converted_orders  ?? 0),
    }

    if (!hasDateRange && preloadedPeriods) {
      const r0 = preloadedPeriods[0]
      currentPeriodLabel  = r0?.period_label ?? null
      previousPeriodLabel = preloadedPeriods.length >= 2 ? (preloadedPeriods[1].period_label ?? null) : null
    }

    const avgOV = c.converted_orders > 0 ? c.converted_sales / c.converted_orders : 0

    // ── Parse comparison (converted_sales vs previous period) ─────────────────
    let cmpConvertedSales: number | null = null

    if (hasDateRange) {
      const p = prevKpi
      if (p) {
        cmpConvertedSales = cmpRatio(c.converted_sales, Number(p.converted_sales ?? 0))
      }
    } else if (preloadedPeriods && preloadedPeriods.length >= 2) {
      const prevConv = Number(preloadedPeriods[1].converted_sales ?? 0)
      cmpConvertedSales = cmpRatio(c.converted_sales, prevConv)
    }

    const res = NextResponse.json({
      ok: true,
      data: {
        kpi: {
          ...c,
          avg_order_value:       avgOV,
          cmp_converted_sales:   cmpConvertedSales,
          comparison_label:      comparisonLabel,
          current_period_label:  currentPeriodLabel,
          previous_period_label: previousPeriodLabel,
        },
        by_period: periodsRaw.map(r => ({
          period:                r.period,
          period_label:          r.period_label,
          total_online:          Number(r.total_online),
          total_offline:         Number(r.total_offline),
          converted_online:      Number(r.converted_online),
          converted_offline:     Number(r.converted_offline),
          not_converted_online:  Number(r.not_converted_online),
          not_converted_offline: Number(r.not_converted_offline),
        })),
        options: {
          cmg:    cmgOptsRaw.map(o => o.cmg).filter(Boolean).sort(),
          agents: agentOptsRaw.map(o => o.agent).filter(Boolean).sort(),
        },
        months: monthsRaw.map(r => r.month),
      },
    })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
