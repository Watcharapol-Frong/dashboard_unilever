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

    // Build conditions for conversions (mart_telesales_orders)
    const orderConditions: string[] = ["customer_type IN ('new_customer', 'retention')"]
    if (startDate) {
      orderConditions.push(`order_date >= $${params.indexOf(startDate) + 1}::date`)
    }
    if (endDate) {
      orderConditions.push(`order_date <= $${params.indexOf(endDate) + 1}::date`)
    }
    if (channel !== 'all') {
      orderConditions.push(`channel = $${params.indexOf(channel) + 1}`)
    }
    if (cmg !== 'all') {
      orderConditions.push(`dynamic_cmg = $${params.indexOf(cmg) + 1}`)
    }
    const conversionsWhere = 'WHERE ' + orderConditions.join(' AND ')

    const row = await queryOne<{
      leads_all: string
      contacted: string
      engaged: string
      not_engaged: string
      total_converted: string
      new_converted: string
      repeat_converted: string
      converted_engaged: string
      converted_not_engaged: string
      new_converted_engaged: string
      new_converted_not_engaged: string
      repeat_converted_engaged: string
      repeat_converted_not_engaged: string
    }>(`
      WITH call_stats AS (
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
        SELECT
          mmid,
          BOOL_OR(customer_type = 'new_customer') AS is_new_conv,
          BOOL_OR(customer_type = 'retention')    AS is_ret_conv
        FROM mart_telesales_orders
        ${conversionsWhere}
        GROUP BY mmid
      )
      SELECT
        (SELECT COUNT(DISTINCT mmid) FROM leads)::text AS leads_all,
        COUNT(DISTINCT c.mmid)::text                                                                            AS contacted,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'engaged')::text                            AS engaged,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'not_engaged')::text                        AS not_engaged,
        COUNT(DISTINCT conv.mmid)::text                                                                         AS total_converted,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_new_conv)::text                                        AS new_converted,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_ret_conv)::text                                        AS repeat_converted,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE c.engagement_status = 'engaged')::text                         AS converted_engaged,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE c.engagement_status = 'not_engaged')::text                     AS converted_not_engaged,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_new_conv AND c.engagement_status = 'engaged')::text    AS new_converted_engaged,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_new_conv AND c.engagement_status = 'not_engaged')::text AS new_converted_not_engaged,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_ret_conv AND c.engagement_status = 'engaged')::text    AS repeat_converted_engaged,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_ret_conv AND c.engagement_status = 'not_engaged')::text AS repeat_converted_not_engaged
      FROM call_stats c
      LEFT JOIN conversions conv ON conv.mmid = c.mmid
    `, params)

    if (!row) {
      return NextResponse.json({ ok: true, data: null })
    }

    const leadsAll            = Number(row.leads_all)
    const contacted           = Number(row.contacted)
    const engaged             = Number(row.engaged)
    const notEngaged          = Number(row.not_engaged)
    const totalConverted      = Number(row.total_converted)
    const newConverted        = Number(row.new_converted)
    const repeatConverted     = Number(row.repeat_converted)
    const notContacted        = Math.max(leadsAll - contacted, 0)

    const convertedFromEngaged    = Number(row.converted_engaged)
    const convertedFromNotEngaged = Number(row.converted_not_engaged)

    const newConvertedEngaged       = Number(row.new_converted_engaged)
    const newConvertedNotEngaged    = Number(row.new_converted_not_engaged)
    const repeatConvertedEngaged    = Number(row.repeat_converted_engaged)
    const repeatConvertedNotEngaged = Number(row.repeat_converted_not_engaged)

    // Not Converted split by engagement path
    const notConvertedEngaged    = Math.max(engaged    - convertedFromEngaged,    0)
    const notConvertedNotEngaged = Math.max(notEngaged - convertedFromNotEngaged, 0)

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

    const nodes = [
      { name: 'All Leads',       category: 'source'  },
      { name: 'Contacted',       category: 'stage'   },
      { name: 'Not Contacted',   category: 'drop'    },
      { name: 'Engaged',         category: 'stage'   },
      { name: 'Not Engaged',     category: 'drop'    },
      { name: 'Not Converted',   category: 'drop'    },
      { name: 'Converted',       category: 'outcome' },
      { name: 'New Customer',    category: 'outcome' },
      { name: 'Repeat Customer', category: 'outcome' },
    ]

    const links = [
      // All Leads → Contacted / Not Contacted
      { source: 0, target: 1, value: Math.max(contacted,    1) },
      { source: 0, target: 2, value: Math.max(notContacted, 1) },

      // Contacted → Engaged / Not Engaged
      { source: 1, target: 3, value: Math.max(engaged,    1) },
      { source: 1, target: 4, value: Math.max(notEngaged, 1) },

      // Engaged → Converted / Not Converted
      { source: 3, target: 6, value: Math.max(convertedFromEngaged,    1) },
      { source: 3, target: 5, value: Math.max(notConvertedEngaged,     1) },

      // Not Engaged → Converted / Not Converted  (ตามข้อมูลจริง mart_telesales_orders)
      { source: 4, target: 6, value: Math.max(convertedFromNotEngaged, 1) },
      { source: 4, target: 5, value: Math.max(notConvertedNotEngaged,  1) },

      // Converted → New Customer / Repeat Customer
      // (flows from both Engaged & Not Engaged paths)
      { source: 6, target: 7, value: Math.max(newConvertedEngaged + newConvertedNotEngaged,       1) },
      { source: 6, target: 8, value: Math.max(repeatConvertedEngaged + repeatConvertedNotEngaged, 1) },
    ]

    const summary = {
      leadsAll,
      contacted,
      notContacted,
      engaged,
      notEngaged,
      totalConverted,
      newConverted,
      repeatConverted,
      convertedFromEngaged,
      convertedFromNotEngaged,
      contactRate:    leadsAll  > 0 ? contacted      / leadsAll  : 0,
      engageRate:     contacted > 0 ? engaged         / contacted : 0,
      conversionRate: contacted > 0 ? totalConverted  / contacted : 0,
    }

    const res = NextResponse.json({ ok: true, data: { nodes, links, summary } })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
