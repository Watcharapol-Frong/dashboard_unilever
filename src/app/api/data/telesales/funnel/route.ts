import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const channel = (searchParams.get('channel') || '').split(',').filter(Boolean)
    const cmg     = (searchParams.get('cmg')     || '').split(',').filter(Boolean)
    const agent   = (searchParams.get('agent')   || '').split(',').filter(Boolean)

    // Build conditions for telesales_calls
    const conditions: string[] = ['first_connected_date IS NOT NULL']
    const params: any[] = []

    if (startDate) {
      params.push(startDate)
      conditions.push(`first_connected_date >= $${params.length}::date`)
    }
    if (endDate) {
      params.push(endDate)
      conditions.push(`first_connected_date <= $${params.length}::date`)
    }
    if (agent.length > 0) {
      params.push(agent)
      conditions.push(`agent = ANY($${params.length})`)
    }
    let channelParamIdx: number | null = null
    let cmgParamIdx: number | null = null

    if (channel.length > 0) {
      params.push(channel)
      channelParamIdx = params.length
      conditions.push(`mmid IN (SELECT DISTINCT mmid FROM sales_hoc_orders WHERE channel = ANY($${channelParamIdx}))`)
    }
    if (cmg.length > 0) {
      const NO_SEG    = '__no_segment__'
      const realCmg   = cmg.filter(c => c !== NO_SEG)
      const inclNoSeg = cmg.includes(NO_SEG)
      // Use NOT EXISTS for better performance than NOT IN subquery
      const noSegSql  = `NOT EXISTS (SELECT 1 FROM mart_telesales_orders WHERE mmid = telesales_calls.mmid AND primary_cmg IS NOT NULL)`

      if (realCmg.length > 0) {
        params.push(realCmg)
        cmgParamIdx = params.length
        const inSql = `mmid IN (SELECT DISTINCT mmid FROM mart_telesales_orders WHERE primary_cmg = ANY($${cmgParamIdx}))`
        conditions.push(inclNoSeg ? `(${inSql} OR ${noSegSql})` : inSql)
      } else if (inclNoSeg) {
        conditions.push(noSegSql)
      }
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ')

    // sales_hoc_orders channel filter (CMG filtering handled by call_stats)
    const orderExtraConditions: string[] = []
    if (channelParamIdx !== null) orderExtraConditions.push(`channel = ANY($${channelParamIdx})`)
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
              -- Thai DB values: no-answer / unreachable / not interested statuses
              WHERE call_status NOT LIKE 'ไม่รับสาย%'                        -- no answer variants
                AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'  -- phone off / unreachable
                AND call_status IS DISTINCT FROM 'ไม่สะดวกคุย'              -- not convenient to talk
                AND call_status IS DISTINCT FROM 'ยังไม่ต้องการสินค้า'       -- not interested
            ) > 0 THEN 'engaged'
            ELSE 'not_engaged'
          END AS engagement_status
        FROM telesales_calls
        ${whereClause}
        GROUP BY mmid
      ),
      conversions AS (
        -- We map customer outcomes flags from mart_telesales_orders
        SELECT
          mmid,
          BOOL_OR(customer_type = 'new_customer')             AS is_new,
          BOOL_OR(customer_type = 'retention')                AS is_repeat,
          BOOL_OR(customer_type = 'first_order_not_converted') AS is_not_conv_new,
          BOOL_OR(customer_type = 'retention_not_converted')   AS is_not_conv_ret
        FROM sales_hoc_orders
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
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_new          THEN c.mmid END)::text AS new_conv_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_repeat       THEN c.mmid END)::text AS repeat_conv_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_not_conv_new THEN c.mmid END)::text AS not_conv_new_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_not_conv_ret THEN c.mmid END)::text AS not_conv_ret_engaged,

        -- Not Engaged path outcomes
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.is_new          THEN c.mmid END)::text AS new_conv_not_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.is_repeat       THEN c.mmid END)::text AS repeat_conv_not_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.is_not_conv_new THEN c.mmid END)::text AS not_conv_new_not_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'not_engaged' AND cv.is_not_conv_ret THEN c.mmid END)::text AS not_conv_ret_not_engaged

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
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
