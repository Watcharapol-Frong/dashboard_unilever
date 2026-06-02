import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate   = searchParams.get('endDate')
    const channel   = (searchParams.get('channel') || '').split(',').filter(Boolean)
    const cmg       = (searchParams.get('cmg')     || '').split(',').filter(Boolean)
    const agent     = (searchParams.get('agent')   || '').split(',').filter(Boolean)

    const params: any[] = []
    const push = (v: any) => { params.push(v); return params.length }

    // ── Simple WHERE conditions (all on indexed columns of telesales_calls) ──
    const tcWhere: string[] = ['tc.first_connected_date IS NOT NULL']
    if (startDate) tcWhere.push(`tc.first_connected_date >= $${push(startDate)}::date`)
    if (endDate)   tcWhere.push(`tc.first_connected_date <= $${push(endDate)}::date`)
    if (agent.length > 0) tcWhere.push(`tc.agent = ANY($${push(agent)})`)

    // ── Pre-computed MMID filter CTEs (each table scanned once, then hash-joined) ──
    const filterCTEs: string[] = []
    const callStatsJoins: string[] = []
    const callStatsConds: string[] = []
    let channelParamIdx: number | null = null

    if (channel.length > 0) {
      channelParamIdx = push(channel)
      filterCTEs.push(`ch_set AS (
        SELECT DISTINCT mmid FROM sales_hoc_orders WHERE channel = ANY($${channelParamIdx})
      )`)
      callStatsJoins.push(`INNER JOIN ch_set ON ch_set.mmid = tc.mmid`)
    }

    const NO_SEG    = '__no_segment__'
    const realCmg   = cmg.filter(c => c !== NO_SEG)
    const inclNoSeg = cmg.includes(NO_SEG)
    let cmgParamIdx: number | null = null

    if (realCmg.length > 0) {
      cmgParamIdx = push(realCmg)
      filterCTEs.push(`seg_set AS (
        SELECT DISTINCT mmid FROM mart_telesales_orders WHERE primary_cmg = ANY($${cmgParamIdx})
      )`)
    }
    if (inclNoSeg) {
      // No Segment: called MMIDs with no segment in mart (EXCEPT is O(n+m) vs correlated O(n*m))
      filterCTEs.push(`noseg_set AS (
        SELECT DISTINCT mmid FROM telesales_calls
        EXCEPT
        SELECT DISTINCT mmid FROM mart_telesales_orders WHERE primary_cmg IS NOT NULL
      )`)
    }

    if (realCmg.length > 0 && inclNoSeg) {
      callStatsJoins.push(`LEFT JOIN seg_set   ON seg_set.mmid   = tc.mmid`)
      callStatsJoins.push(`LEFT JOIN noseg_set ON noseg_set.mmid = tc.mmid`)
      callStatsConds.push(`(seg_set.mmid IS NOT NULL OR noseg_set.mmid IS NOT NULL)`)
    } else if (realCmg.length > 0) {
      callStatsJoins.push(`INNER JOIN seg_set ON seg_set.mmid = tc.mmid`)
    } else if (inclNoSeg) {
      callStatsJoins.push(`INNER JOIN noseg_set ON noseg_set.mmid = tc.mmid`)
    }

    const callStatsWhere = 'WHERE ' + [...tcWhere, ...callStatsConds].join(' AND ')

    // ── Conversions filter (channel only — CMG is already scoped by call_stats) ──
    const convConds: string[] = [
      `customer_type IN ('new_customer', 'retention', 'first_order_not_converted', 'retention_not_converted')`
    ]
    if (channelParamIdx !== null) convConds.push(`channel = ANY($${channelParamIdx})`)
    const convWhere = convConds.join(' AND ')

    // ── Build full SQL ──────────────────────────────────────────────────────────
    const ctePreamble = filterCTEs.length > 0 ? filterCTEs.join(',\n  ') + ',\n  ' : ''
    const joinsClause = callStatsJoins.length > 0 ? '\n      ' + callStatsJoins.join('\n      ') : ''

    const row = await queryOne<{
      leads_all: string
      contacted: string
      engaged: string
      not_engaged: string
      new_conv_engaged: string
      repeat_conv_engaged: string
      not_conv_new_engaged: string
      not_conv_ret_engaged: string
      new_conv_not_engaged: string
      repeat_conv_not_engaged: string
      not_conv_new_not_engaged: string
      not_conv_ret_not_engaged: string
    }>(`
      WITH
      ${ctePreamble}call_stats AS (
        SELECT tc.mmid,
          CASE
            WHEN COUNT(*) FILTER (
              WHERE tc.call_status NOT LIKE 'ไม่รับสาย%'
                AND tc.call_status IS DISTINCT FROM 'ปิดเครื่อง/ติดต่อไม่ได้'
                AND tc.call_status IS DISTINCT FROM 'ไม่สะดวกคุย'
                AND tc.call_status IS DISTINCT FROM 'ยังไม่ต้องการสินค้า'
            ) > 0 THEN 'engaged'
            ELSE 'not_engaged'
          END AS engagement_status
        FROM telesales_calls tc${joinsClause}
        ${callStatsWhere}
        GROUP BY tc.mmid
      ),
      conversions AS (
        SELECT
          mmid,
          BOOL_OR(customer_type = 'new_customer')              AS is_new,
          BOOL_OR(customer_type = 'retention')                 AS is_repeat,
          BOOL_OR(customer_type = 'first_order_not_converted') AS is_not_conv_new,
          BOOL_OR(customer_type = 'retention_not_converted')   AS is_not_conv_ret
        FROM sales_hoc_orders
        WHERE ${convWhere}
        GROUP BY mmid
      )
      SELECT
        (SELECT COUNT(DISTINCT mmid) FROM leads)::text AS leads_all,
        COUNT(DISTINCT c.mmid)::text AS contacted,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'engaged')::text     AS engaged,
        COUNT(DISTINCT c.mmid) FILTER (WHERE c.engagement_status = 'not_engaged')::text AS not_engaged,

        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_new          THEN c.mmid END)::text AS new_conv_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_repeat       THEN c.mmid END)::text AS repeat_conv_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_not_conv_new THEN c.mmid END)::text AS not_conv_new_engaged,
        COUNT(DISTINCT CASE WHEN c.engagement_status = 'engaged'     AND cv.is_not_conv_ret THEN c.mmid END)::text AS not_conv_ret_engaged,

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

    const newConvEngaged     = Number(row.new_conv_engaged)
    const repeatConvEngaged  = Number(row.repeat_conv_engaged)
    const convFromEngaged    = newConvEngaged + repeatConvEngaged
    const notConvEngaged     = Math.max(engaged - convFromEngaged, 0)

    const newConvNotEngaged    = Number(row.new_conv_not_engaged)
    const repeatConvNotEngaged = Number(row.repeat_conv_not_engaged)
    const convFromNotEngaged   = newConvNotEngaged + repeatConvNotEngaged
    const notConvNotEngaged    = Math.max(notEngaged - convFromNotEngaged, 0)

    const totalConverted   = convFromEngaged + convFromNotEngaged
    const newConverted     = newConvEngaged   + newConvNotEngaged
    const repeatConverted  = repeatConvEngaged + repeatConvNotEngaged
    const totalNotConverted = notConvEngaged + notConvNotEngaged

    const notConvNewEngaged    = Number(row.not_conv_new_engaged)
    const notConvRetEngaged    = Number(row.not_conv_ret_engaged)
    const notConvNewNotEngaged = Number(row.not_conv_new_not_engaged)
    const notConvRetNotEngaged = Number(row.not_conv_ret_not_engaged)
    const notConvNewTotal = notConvNewEngaged + notConvNewNotEngaged
    const notConvRetTotal = notConvRetEngaged + notConvRetNotEngaged

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
      { source: 0, target: 1, value: Math.max(contacted,          1) },
      { source: 0, target: 2, value: Math.max(notContacted,       1) },
      { source: 1, target: 3, value: Math.max(engaged,            1) },
      { source: 1, target: 4, value: Math.max(notEngaged,         1) },
      { source: 3, target: 6, value: Math.max(convFromEngaged,    1) },
      { source: 3, target: 5, value: Math.max(notConvEngaged,     1) },
      { source: 4, target: 6, value: Math.max(convFromNotEngaged, 1) },
      { source: 4, target: 5, value: Math.max(notConvNotEngaged,  1) },
      { source: 6, target: 7, value: Math.max(newConverted,       1) },
      { source: 6, target: 8, value: Math.max(repeatConverted,    1) },
      { source: 5, target: 9,  value: Math.max(notConvNewTotal,   1) },
      { source: 5, target: 10, value: Math.max(notConvRetTotal,   1) },
    ]

    const summary = {
      leadsAll, contacted, notContacted, engaged, notEngaged,
      totalConverted, totalNotConverted, newConverted, repeatConverted,
      convFromEngaged, convFromNotEngaged, notConvNewTotal, notConvRetTotal,
      contactRate:    leadsAll  > 0 ? contacted     / leadsAll  : 0,
      engageRate:     contacted > 0 ? engaged        / contacted : 0,
      conversionRate: contacted > 0 ? totalConverted / contacted : 0,
    }

    const res = NextResponse.json({ ok: true, data: { nodes, links, summary } })
    setCacheHeader(res, 'MEDIUM')
    return res
  })
}
