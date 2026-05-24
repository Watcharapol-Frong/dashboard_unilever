import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withAdmin(async () => {
    const row = await queryOne<{
      leads_all: string
      contacted: string
      reached: string
      not_reached: string
      engaged: string
      reached_not_engaged: string
      total_converted: string
      new_converted: string
      repeat_converted: string
      converted_engaged: string
      converted_not_engaged: string
      converted_not_reached: string
    }>(`
      WITH call_stats AS (
        SELECT
          mmid,
          CASE
            WHEN COUNT(*) FILTER (
              WHERE call_status NOT LIKE 'ไม่รับสาย%'
                AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
            ) > 0 THEN 'reached'
            ELSE 'called_not_reached'
          END AS contact_status,
          CASE
            WHEN COUNT(*) FILTER (
              WHERE call_status NOT LIKE 'ไม่รับสาย%'
                AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
                AND call_status IS DISTINCT FROM 'ไม่สะดวกคุย'
                AND call_status IS DISTINCT FROM 'ยังไม่ต้องการสินค้า'
            ) > 0 THEN 'engaged'
            WHEN COUNT(*) FILTER (
              WHERE call_status NOT LIKE 'ไม่รับสาย%'
                AND call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
            ) > 0 THEN 'reached_not_engaged'
            ELSE 'not_reached'
          END AS engagement_status
        FROM telesales_calls
        GROUP BY mmid
      ),
      conversions AS (
        SELECT
          mmid,
          BOOL_OR(customer_type = 'new_customer') AS is_new_conv,
          BOOL_OR(customer_type = 'retention') AS is_ret_conv
        FROM mart_telesales_orders
        WHERE customer_type IN ('new_customer', 'retention')
        GROUP BY mmid
      )
      SELECT
        (SELECT COUNT(DISTINCT mmid) FROM leads)::text AS leads_all,
        COUNT(DISTINCT c.mmid)::text AS contacted,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.contact_status = 'reached')::text AS reached,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.contact_status = 'called_not_reached')::text AS not_reached,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'engaged')::text AS engaged,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'reached_not_engaged')::text AS reached_not_engaged,
        COUNT(DISTINCT conv.mmid)::text AS total_converted,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_new_conv)::text AS new_converted,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE conv.is_ret_conv)::text AS repeat_converted,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE c.engagement_status = 'engaged')::text AS converted_engaged,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE c.engagement_status = 'reached_not_engaged')::text AS converted_not_engaged,
        COUNT(DISTINCT conv.mmid) FILTER (WHERE c.contact_status = 'called_not_reached')::text AS converted_not_reached
      FROM call_stats c
      LEFT JOIN conversions conv ON conv.mmid = c.mmid
    `)

    if (!row) {
      return NextResponse.json({ ok: true, data: null })
    }

    const leadsAll = Number(row.leads_all)
    const contacted = Number(row.contacted)
    const reached = Number(row.reached)
    const notReached = Number(row.not_reached)
    const engaged = Number(row.engaged)
    const reachedNotEngaged = Number(row.reached_not_engaged)
    const newConverted = Number(row.new_converted)
    const repeatConverted = Number(row.repeat_converted)
    const totalConverted = Number(row.total_converted)
    const notContacted = leadsAll - contacted

    // Build Sankey nodes & links
    // Clean funnel flow:
    //  0: All Leads
    //  1: Contacted
    //  2: Not Contacted (drop-off)
    //  3: Answered
    //  4: No Answer (drop-off)
    //  5: Engaged (had meaningful conversation)
    //  6: Not Engaged (answered but not interested)
    //  7: Not Converted (engaged but didn't order)
    //  8: Converted
    //  9: New Customer
    // 10: Repeat Customer

    const nodes = [
      { name: 'All Leads',       category: 'source' },
      { name: 'Contacted',       category: 'stage' },
      { name: 'Not Contacted',   category: 'drop' },
      { name: 'Answered',        category: 'stage' },
      { name: 'No Answer',       category: 'drop' },
      { name: 'Engaged',         category: 'stage' },
      { name: 'Not Engaged',     category: 'drop' },
      { name: 'Not Converted',   category: 'drop' },
      { name: 'Converted',       category: 'outcome' },
      { name: 'New Customer',    category: 'outcome' },
      { name: 'Repeat Customer', category: 'outcome' },
    ]

    // Drop-off calculation
    const notAnswered = notReached          // no answer
    const notEngaged = reachedNotEngaged    // answered but didn't engage
    const convertedFromEngaged = Number(row.converted_engaged)
    const notConverted = Math.max(engaged - convertedFromEngaged, 0)

    const links = [
      // All Leads → Contacted / Not Contacted
      { source: 0, target: 1, value: Math.max(contacted, 1) },
      { source: 0, target: 2, value: Math.max(notContacted, 1) },
      // Contacted → Answered / No Answer
      { source: 1, target: 3, value: Math.max(reached, 1) },
      { source: 1, target: 4, value: Math.max(notAnswered, 1) },
      // Answered → Engaged / Not Engaged
      { source: 3, target: 5, value: Math.max(engaged, 1) },
      { source: 3, target: 6, value: Math.max(notEngaged, 1) },
      // Engaged → Converted / Not Converted
      { source: 5, target: 8, value: Math.max(convertedFromEngaged, 1) },
      { source: 5, target: 7, value: Math.max(notConverted, 1) },
      // Converted → New Customer / Repeat Customer
      { source: 8, target: 9,  value: Math.max(newConverted, 1) },
      { source: 8, target: 10, value: Math.max(repeatConverted, 1) },
    ]

    const summary = {
      leadsAll,
      contacted,
      notContacted,
      reached,
      notReached,
      engaged,
      notEngaged,
      totalConverted,
      newConverted,
      repeatConverted,
      contactRate: leadsAll > 0 ? contacted / leadsAll : 0,
      reachRate: contacted > 0 ? reached / contacted : 0,
      engageRate: reached > 0 ? engaged / reached : 0,
      conversionRate: engaged > 0 ? totalConverted / engaged : 0,
    }

    const res = NextResponse.json({ ok: true, data: { nodes, links, summary } })
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res
  })
}
