import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
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
  channel: string,
  cmg: string,
  agent: string,
  conversion: string,
) {
  const conditions: string[] = []
  const params: any[] = []

  if (startDate) { params.push(startDate); conditions.push(`order_date >= $${params.length}::date`) }
  if (endDate)   { params.push(endDate);   conditions.push(`order_date <= $${params.length}::date`) }
  if (channel    !== 'all') { params.push(channel);    conditions.push(`channel = $${params.length}`) }
  if (cmg        !== 'all') { params.push(cmg);        conditions.push(`dynamic_cmg = $${params.length}`) }
  if (agent      !== 'all') { params.push(agent);      conditions.push(`agent = $${params.length}`) }
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
    total_orders: string; new_customers: string; converted_customers: string; total_qty: string
  }>(`
    SELECT
      COALESCE(SUM(sales_in_vat), 0)::text                                                       AS total_sales,
      COALESCE(SUM(CASE WHEN channel='online'  THEN sales_in_vat ELSE 0 END), 0)::text           AS online_sales,
      COALESCE(SUM(CASE WHEN channel='offline' THEN sales_in_vat ELSE 0 END), 0)::text           AS offline_sales,
      COUNT(DISTINCT order_number)::text                                                          AS total_orders,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type='new_customer')::text                     AS new_customers,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','retention'))::text     AS converted_customers,
      COALESCE(SUM(sales_qty), 0)::text                                                          AS total_qty
    FROM mart_telesales_orders
    ${where}
  `, params)
}

// Returns last 2 complete periods (most-recent first) for auto comparison
async function fetchLastTwoPeriods(interval: Interval, where: string, params: any[]) {
  const grp = periodExpr(interval)
  return query<{
    period: string; total_sales: string; total_orders: string
    new_customers: string; converted_customers: string
  }>(`
    SELECT
      ${grp} AS period,
      SUM(sales_in_vat)::text                                                         AS total_sales,
      COUNT(DISTINCT order_number)::text                                              AS total_orders,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type='new_customer')::text          AS new_customers,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','retention'))::text AS converted_customers
    FROM mart_telesales_orders
    ${where}
    GROUP BY ${grp}
    ORDER BY ${grp} DESC
    LIMIT 2
  `, params)
}

const cmpRatio = (curr: number, prev: number) => prev > 0 ? (curr - prev) / prev : null

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)
    const rawInterval = searchParams.get('interval') ?? 'monthly'
    const interval: Interval =
      rawInterval === 'daily' ? 'daily' : rawInterval === 'weekly' ? 'weekly' : 'monthly'
    const startDate  = searchParams.get('startDate')
    const endDate    = searchParams.get('endDate')
    const channel    = searchParams.get('channel')    || 'all'
    const cmg        = searchParams.get('cmg')        || 'all'
    const agent      = searchParams.get('agent')      || 'all'
    const conversion = searchParams.get('conversion') || 'all'

    const hasDateRange = !!(startDate && endDate)

    // Filters without date (for trend in monthly/weekly and for options)
    const noDate = buildWhere(null, null, channel, cmg, agent, conversion)
    // Filters with date (for custom mode KPI & trend)
    const curr = buildWhere(startDate, endDate, channel, cmg, agent, conversion)

    // Trend uses full date range only in custom mode
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

    const [currKpi, prevOrPeriods, periodsRaw, ordersRaw, optsRaw] = await Promise.all([
      // Current KPI: date-filtered for custom, all-time for monthly/weekly
      fetchKpis(curr.where, curr.params),

      // Comparison: explicit prev period (custom) OR last 2 periods (monthly/weekly)
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
        FROM mart_telesales_orders
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
        FROM mart_telesales_orders
        ${curr.where}
        ORDER BY order_date DESC, order_number DESC
        LIMIT 100
      `, curr.params),

      // Unfiltered options
      query<{ cmg: string; agent: string }>(`
        SELECT DISTINCT dynamic_cmg AS cmg, agent
        FROM mart_telesales_orders
        WHERE dynamic_cmg IS NOT NULL AND agent IS NOT NULL
        ORDER BY dynamic_cmg, agent
      `),
    ])

    // Parse current KPI
    const c = {
      total_sales:         Number(currKpi?.total_sales         ?? 0),
      online_sales:        Number(currKpi?.online_sales        ?? 0),
      offline_sales:       Number(currKpi?.offline_sales       ?? 0),
      total_orders:        Number(currKpi?.total_orders        ?? 0),
      new_customers:       Number(currKpi?.new_customers       ?? 0),
      converted_customers: Number(currKpi?.converted_customers ?? 0),
      total_qty:           Number(currKpi?.total_qty           ?? 0),
    }
    const avgOV = c.total_orders > 0 ? c.total_sales / c.total_orders : 0

    // Parse comparison
    let cmpSales: number | null = null
    let cmpOrders: number | null = null
    let cmpNew: number | null = null
    let cmpConverted: number | null = null
    let cmpAov: number | null = null

    if (hasDateRange) {
      // prevOrPeriods is the result of fetchKpis (single row queryOne)
      const p = prevOrPeriods as Awaited<ReturnType<typeof fetchKpis>>
      if (p) {
        const ps = Number(p.total_sales ?? 0)
        const po = Number(p.total_orders ?? 0)
        const pn = Number(p.new_customers ?? 0)
        const pc = Number(p.converted_customers ?? 0)
        const paov = po > 0 ? ps / po : 0
        cmpSales     = cmpRatio(c.total_sales,         ps)
        cmpOrders    = cmpRatio(c.total_orders,        po)
        cmpNew       = cmpRatio(c.new_customers,       pn)
        cmpConverted = cmpRatio(c.converted_customers, pc)
        cmpAov       = cmpRatio(avgOV,                 paov)
      }
    } else {
      // prevOrPeriods is an array from fetchLastTwoPeriods
      const rows = prevOrPeriods as Awaited<ReturnType<typeof fetchLastTwoPeriods>>
      if (Array.isArray(rows) && rows.length >= 2) {
        const [r0, r1] = rows
        const s0 = Number(r0.total_sales ?? 0), s1 = Number(r1.total_sales ?? 0)
        const o0 = Number(r0.total_orders ?? 0), o1 = Number(r1.total_orders ?? 0)
        const n0 = Number(r0.new_customers ?? 0), n1 = Number(r1.new_customers ?? 0)
        const c0 = Number(r0.converted_customers ?? 0), c1 = Number(r1.converted_customers ?? 0)
        cmpSales     = cmpRatio(s0, s1)
        cmpOrders    = cmpRatio(o0, o1)
        cmpNew       = cmpRatio(n0, n1)
        cmpConverted = cmpRatio(c0, c1)
        cmpAov       = cmpRatio(o0 > 0 ? s0/o0 : 0, o1 > 0 ? s1/o1 : 0)
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        kpi: {
          ...c,
          avg_order_value: avgOV,
          cmp_total_sales:         cmpSales,
          cmp_total_orders:        cmpOrders,
          cmp_new_customers:       cmpNew,
          cmp_avg_order_value:     cmpAov,
          cmp_converted_customers: cmpConverted,
          comparison_label:        comparisonLabel,
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
      },
    })
  })
}
