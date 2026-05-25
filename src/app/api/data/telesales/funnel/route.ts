import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const channel = searchParams.get('channel') || 'all'
    const cmg = searchParams.get('cmg') || 'all'
    const agent = searchParams.get('agent') || 'all'

    // Build conditions for telesales_calls
    const conditions: string[] = ['first_connected_date IS NOT NULL']
    const params: string[] = []

    if (startDate) {
      params.push(startDate)
      conditions.push(`first_connected_date >= $${params.length}::date`)
    }
    if (endDate) {
      params.push(endDate)
      conditions.push(`first_connected_date <= $${params.length}::date`)
    }
    if (agent !== 'all') {
      params.push(agent)
      conditions.push(`agent = $${params.length}`)
    }
    if (channel !== 'all' || cmg !== 'all') {
      const subConditions: string[] = []
      if (channel !== 'all') {
        params.push(channel)
        subConditions.push(`channel = $${params.length}`)
      }
      if (cmg !== 'all') {
        params.push(cmg)
        subConditions.push(`dynamic_cmg = $${params.length}`)
      }
      conditions.push(`mmid IN (
        SELECT DISTINCT mmid FROM mart_telesales_orders
        WHERE ${subConditions.join(' AND ')}
      )`)
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ')

    // mart_telesales_orders channel/cmg filter
    const orderExtraConditions: string[] = []
    if (channel !== 'all') orderExtraConditions.push(`channel = $${params.indexOf(channel) + 1}`)
    if (cmg !== 'all')     orderExtraConditions.push(`dynamic_cmg = $${params.indexOf(cmg) + 1}`)
    const orderExtra = orderExtraConditions.length ? 'AND ' + orderExtraConditions.join(' AND ') : ''

    const row = await queryOne<{
      leads_all: string
      contacted: string
      engaged: string
      not_engaged: string
      
      // Engaged path outcomes
      new_conv_engaged: string
      repeat_conv_engaged: string
      not_conv_new_engaged: string
      not_conv_ret_engaged: string

      // Not Engaged path outcomes
      new_conv_not_engaged: string
      repeat_conv_not_engaged: string
      not_conv_new_not_engaged: string
      not_conv_ret_not_engaged: string
    }>(`
      WITH call_stats AS (
        -- Classify each mmid as engaged or not_engaged
        SELECT
          mmid,
          CASE
            WHEN COUNT(*) FILTER (
              WHERE call_status NOT LIKE 'ไม่รับสาย%'
                AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
                AND call_status IS DISTINCT FROM 'ไม่สะดวกคุย'
                AND call_status IS DISTINCT FROM 'ยังไม่ต้องการสินค้า'
            ) > 0 THEN 'engaged'
            ELSE 'not_engaged'
          END AS engagement_status
        FROM telesales_calls
        ${whereClause}
        GROUP BY mmid
      ),
      conversions AS (
        -- We map customer outcomes from mart_telesales_orders
        SELECT
          mmid,
          -- Top outcome priority per mmid
          CASE
            WHEN BOOL_OR(customer_type = 'new_customer')              THEN 'new_customer'
            WHEN BOOL_OR(customer_type = 'retention')                 THEN 'retention'
            WHEN BOOL_OR(customer_type = 'retention_not_converted')   THEN 'retention_not_converted'
            ELSE                                                           'first_order_not_converted'
          END AS outcome
        FROM mart_telesales_orders
        WHERE customer_type IN ('new_customer', 'retention', 'first_order_not_converted', 'retention_not_converted')
          ${orderExtra}
        GROUP BY mmid
      )
      SELECT
        (SELECT COUNT(DISTINCT mmid) FROM leads)::text AS leads_all,
        COUNT(DISTINCT c.mmid)::text AS contacted,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'engaged')::text     AS engaged,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'not_engaged')::text AS not_engaged,

        -- Engaged path outcomes
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.outcome = 'new_customer'              THEN c.mmid END)::text AS new_conv_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.outcome = 'retention'                 THEN c.mmid END)::text AS repeat_conv_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.outcome = 'first_order_not_converted' THEN c.mmid END)::text AS not_conv_new_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.outcome = 'retention_not_converted'   THEN c.mmid END)::text AS not_conv_ret_engaged,

        -- Not Engaged path outcomes
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.outcome = 'new_customer'              THEN c.mmid END)::text AS new_conv_not_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.outcome = 'retention'                 THEN c.mmid END)::text AS repeat_conv_not_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.outcome = 'first_order_not_converted' THEN c.mmid END)::text AS not_conv_new_not_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.outcome = 'retention_not_converted'   THEN c.mmid END)::text AS not_conv_ret_not_engaged

      FROM call_stats c
      LEFT JOIN conversions cv ON cv.mmid = c.mmid
    `, params)

    if (!row) {
      return NextResponse.json({ ok: true, data: null })
    }

    const leadsAll    = Number(row.leads_all)
    const contacted   = Number(row.contacted)
    const engaged     = Number(row.engaged)
    const notEngaged  = Number(row.not_engaged)
    const notContacted = Math.max(leadsAll - contacted, 0)

    // Engaged path
    const newConvEngaged     = Number(row.new_conv_engaged)
    const repeatConvEngaged  = Number(row.repeat_conv_engaged)
    const convFromEngaged    = newConvEngaged + repeatConvEngaged
    const notConvEngaged     = Math.max(engaged - convFromEngaged, 0)

    // Not Engaged path
    const newConvNotEngaged     = Number(row.new_conv_not_engaged)
    const repeatConvNotEngaged  = Number(row.repeat_conv_not_engaged)
    const convFromNotEngaged    = newConvNotEngaged + repeatConvNotEngaged
    const notConvNotEngaged     = Math.max(notEngaged - convFromNotEngaged, 0)

    // Totals
    const totalConverted  = convFromEngaged + convFromNotEngaged
    const newConverted    = newConvEngaged   + newConvNotEngaged
    const repeatConverted = repeatConvEngaged + repeatConvNotEngaged
    const totalNotConverted = notConvEngaged + notConvNotEngaged

    // Not Converted split
    const notConvNewEngaged    = Number(row.not_conv_new_engaged)
    const notConvRetEngaged    = Number(row.not_conv_ret_engaged)
    const notConvNewNotEngaged = Number(row.not_conv_new_not_engaged)
    const notConvRetNotEngaged = Number(row.not_conv_ret_not_engaged)

    const notConvNewTotal = notConvNewEngaged + notConvNewNotEngaged
    const notConvRetTotal = notConvRetEngaged + notConvRetNotEngaged

    // Sankey node index map:
    //  0: All Leads
    //  1: Contacted
    //  2: Not Contacted
    //  3: Engaged
    //  4: Not Engaged
    //  5: Not Converted
    //  6: Converted
    //  7: New Customer
    //  8: Repeat Customer
    //  9: New Not Converted
    //  10: Repeat Not Converted

    const nodes = [
      { name: 'All Leads',            category: 'source'  },
      { name: 'Contacted',            category: 'stage'   },
      { name: 'Not Contacted',        category: 'drop'    },
      { name: 'Engaged',              category: 'stage'   },
      { name: 'Not Engaged',          category: 'stage'   },
      { name: 'Not Converted',        category: 'drop'    },
      { name: 'Converted',            category: 'outcome' },
      { name: 'New Customer',         category: 'outcome' },
      { name: 'Repeat Customer',      category: 'outcome' },
      { name: 'New Not Converted',    category: 'outcome' },
      { name: 'Repeat Not Converted', category: 'outcome' },
    ]

    const links = [
      // All Leads → Contacted / Not Contacted
      { source: 0, target: 1, value: Math.max(contacted,    1) },
      { source: 0, target: 2, value: Math.max(notContacted, 1) },

      // Contacted → Engaged / Not Engaged
      { source: 1, target: 3, value: Math.max(engaged,    1) },
      { source: 1, target: 4, value: Math.max(notEngaged, 1) },

      // Engaged → Converted / Not Converted
      { source: 3, target: 6, value: Math.max(convFromEngaged, 1) },
      { source: 3, target: 5, value: Math.max(notConvEngaged,  1) },

      // Not Engaged → Converted / Not Converted
      { source: 4, target: 6, value: Math.max(convFromNotEngaged, 1) },
      { source: 4, target: 5, value: Math.max(notConvNotEngaged,  1) },

      // Converted → New Customer / Repeat Customer
      { source: 6, target: 7, value: Math.max(newConverted,    1) },
      { source: 6, target: 8, value: Math.max(repeatConverted, 1) },

      // Not Converted → New Not Converted / Repeat Not Converted
      { source: 5, target: 9,  value: Math.max(notConvNewTotal, 1) },
      { source: 5, target: 10, value: Math.max(notConvRetTotal, 1) },
    ]

    const summary = {
      leadsAll,
      contacted,
      notContacted,
      engaged,
      notEngaged,
      totalConverted,
      totalNotConverted,
      newConverted,
      repeatConverted,
      convFromEngaged,
      convFromNotEngaged,
      notConvNewTotal,
      notConvRetTotal,
      contactRate:    leadsAll   > 0 ? contacted     / leadsAll   : 0,
      engageRate:     contacted  > 0 ? engaged        / contacted  : 0,
      conversionRate: contacted  > 0 ? totalConverted / contacted  : 0,
    }

    const res = NextResponse.json({ ok: true, data: { nodes, links, summary } })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
