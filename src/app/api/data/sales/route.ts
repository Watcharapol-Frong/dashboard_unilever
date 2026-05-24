import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Interval = 'daily' | 'weekly' | 'monthly'

function periodExpr(interval: Interval) {
  if (interval === 'daily')   return 'order_date'
  if (interval === 'weekly')  return "DATE_TRUNC('week', order_date)::date"
  return 'month'
}

function labelExpr(interval: Interval) {
  if (interval === 'daily')   return "TO_CHAR(order_date, 'DD Mon')"
  if (interval === 'weekly')  return 'MAX(week_label)'
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
  if (channel !== 'all') { params.push(channel); conditions.push(`channel = $${params.length}`) }
  if (cmg     !== 'all') { params.push(cmg);     conditions.push(`dynamic_cmg = $${params.length}`) }
  if (agent   !== 'all') { params.push(agent);   conditions.push(`agent = $${params.length}`) }
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
      COALESCE(SUM(sales_in_vat), 0)::text                                                          AS total_sales,
      COALESCE(SUM(CASE WHEN channel = 'online'  THEN sales_in_vat ELSE 0 END), 0)::text            AS online_sales,
      COALESCE(SUM(CASE WHEN channel = 'offline' THEN sales_in_vat ELSE 0 END), 0)::text            AS offline_sales,
      COUNT(DISTINCT order_number)::text                                                             AS total_orders,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type = 'new_customer')::text                      AS new_customers,
      COUNT(DISTINCT mmid) FILTER (WHERE customer_type IN ('new_customer','retention'))::text        AS converted_customers,
      COALESCE(SUM(sales_qty), 0)::text                                                             AS total_qty
    FROM mart_telesales_orders
    ${where}
  `, params)
}

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

    // Previous period for KPI comparison (only when explicit date range given)
    let prevStart: string | null = null
    let prevEnd: string | null = null
    let comparisonLabel: string | null = null
    if (startDate && endDate) {
      const s = new Date(startDate)
      const e = new Date(endDate)
      const durMs = e.getTime() - s.getTime()
      const pe = new Date(s.getTime() - 86_400_000)
      const ps = new Date(pe.getTime() - durMs)
      prevEnd = pe.toISOString().split('T')[0]
      prevStart = ps.toISOString().split('T')[0]
      comparisonLabel = 'vs preceding period'
    }

    const curr  = buildWhere(startDate, endDate, channel, cmg, agent, conversion)
    const prev  = buildWhere(prevStart, prevEnd, channel, cmg, agent, conversion)
    const grpBy = periodExpr(interval)
    const lbl   = labelExpr(interval)

    const [currKpi, prevKpi, periodsRaw, ordersRaw, optsRaw] = await Promise.all([
      fetchKpis(curr.where, curr.params),

      prevStart ? fetchKpis(prev.where, prev.params) : Promise.resolve(null),

      query<{ period: string; period_label: string; online: string; offline: string }>(`
        SELECT
          ${grpBy} AS period,
          ${lbl}   AS period_label,
          COALESCE(SUM(CASE WHEN channel = 'online'  THEN sales_in_vat ELSE 0 END), 0)::text AS online,
          COALESCE(SUM(CASE WHEN channel = 'offline' THEN sales_in_vat ELSE 0 END), 0)::text AS offline
        FROM mart_telesales_orders
        ${curr.where}
        GROUP BY ${grpBy}
        ORDER BY ${grpBy}
      `, curr.params),

      query<{
        order_number: string; order_date: string; mmid: string; prod_num: string
        sales_qty: string; sales_in_vat: string; dynamic_cmg: string
        channel: string; agent: string; customer_type: string
      }>(`
        SELECT
          order_number, order_date::text, mmid, prod_num,
          sales_qty::text, sales_in_vat::text, dynamic_cmg,
          channel, agent, customer_type
        FROM mart_telesales_orders
        ${curr.where}
        ORDER BY order_date DESC, order_number DESC
        LIMIT 100
      `, curr.params),

      // Filter options — always from full unfiltered set
      query<{ cmg: string; agent: string }>(`
        SELECT DISTINCT dynamic_cmg AS cmg, agent
        FROM mart_telesales_orders
        WHERE dynamic_cmg IS NOT NULL AND agent IS NOT NULL
        ORDER BY dynamic_cmg, agent
      `),
    ])

    const c = {
      total_sales:          Number(currKpi?.total_sales          ?? 0),
      online_sales:         Number(currKpi?.online_sales         ?? 0),
      offline_sales:        Number(currKpi?.offline_sales        ?? 0),
      total_orders:         Number(currKpi?.total_orders         ?? 0),
      new_customers:        Number(currKpi?.new_customers        ?? 0),
      converted_customers:  Number(currKpi?.converted_customers  ?? 0),
      total_qty:            Number(currKpi?.total_qty            ?? 0),
    }
    const avgOV = c.total_orders > 0 ? c.total_sales / c.total_orders : 0

    const p = prevKpi ? {
      total_sales:         Number(prevKpi.total_sales         ?? 0),
      total_orders:        Number(prevKpi.total_orders        ?? 0),
      new_customers:       Number(prevKpi.new_customers       ?? 0),
      converted_customers: Number(prevKpi.converted_customers ?? 0),
      avg_order_value:     Number(prevKpi.total_orders ?? 0) > 0
                             ? Number(prevKpi.total_sales ?? 0) / Number(prevKpi.total_orders ?? 0)
                             : 0,
    } : null

    const cmpRatio = (curr: number, prev: number) =>
      prev > 0 ? (curr - prev) / prev : null

    return NextResponse.json({
      ok: true,
      data: {
        kpi: {
          ...c,
          avg_order_value: avgOV,
          cmp_total_sales:         p ? cmpRatio(c.total_sales,        p.total_sales)         : null,
          cmp_total_orders:        p ? cmpRatio(c.total_orders,       p.total_orders)        : null,
          cmp_new_customers:       p ? cmpRatio(c.new_customers,      p.new_customers)       : null,
          cmp_avg_order_value:     p ? cmpRatio(avgOV,                p.avg_order_value)     : null,
          cmp_converted_customers: p ? cmpRatio(c.converted_customers, p.converted_customers) : null,
          comparison_label: comparisonLabel,
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
