import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

// ── Whitelisted metric expressions ───────────────────────────────────────────
const METRICS: Record<string, { header: string; sql: string }> = {
  hoc_orders:          { header: 'Orders',          sql: `COUNT(DISTINCT mto.order_number)::int` },
  hoc_sales:           { header: 'Sales (THB)',      sql: `ROUND(SUM(mto.sales_in_vat)::numeric, 2)` },
  qty:                 { header: 'Qty',              sql: `SUM(mto.sales_qty)::int` },
  new_customers:       { header: 'New Customers',    sql: `COUNT(DISTINCT mto.mmid) FILTER (WHERE mto.customer_type = 'new_customer')::int` },
  retention_customers: { header: 'Retention Cust.',  sql: `COUNT(DISTINCT mto.mmid) FILTER (WHERE mto.customer_type = 'retention')::int` },
  unique_customers:    { header: 'Unique Customers', sql: `COUNT(DISTINCT mto.mmid)::int` },
}

// ── Whitelisted breakdown (GROUP BY) expressions ──────────────────────────────
const BREAKDOWNS: Record<string, { header: string; sql: string; groupBy: string }> = {
  month:         { header: 'Month',         sql: `mto.month::text`,                         groupBy: `mto.month` },
  dynamic_cmg:   { header: 'CMG',           sql: `COALESCE(mto.dynamic_cmg,'Unknown')`,     groupBy: `COALESCE(mto.dynamic_cmg,'Unknown')` },
  channel:       { header: 'Channel',       sql: `COALESCE(mto.channel,'Unknown')`,         groupBy: `COALESCE(mto.channel,'Unknown')` },
  customer_type: { header: 'Customer Type', sql: `mto.customer_type`,                       groupBy: `mto.customer_type` },
  agent:         { header: 'Agent',         sql: `COALESCE(mto.agent,'Unknown')`,           groupBy: `COALESCE(mto.agent,'Unknown')` },
  brands:        { header: 'Brand',         sql: `COALESCE(mto.brands,'Unknown')`,          groupBy: `COALESCE(mto.brands,'Unknown')` },
  class_name:    { header: 'Class',         sql: `COALESCE(mto.class_name,'Unknown')`,      groupBy: `COALESCE(mto.class_name,'Unknown')` },
}

// ── Granularity configurations ────────────────────────────────────────────────
type GranSpec = {
  keyHeaders:          string[]
  keySelects:          string[]
  keyGroupBy:          string[]
  availableBreakdowns: string[]
  availableMetrics:    string[]
  orderBy:             string
  needLeads?:          boolean
}

const GRANULARITIES: Record<string, GranSpec> = {
  month: {
    keyHeaders:          ['Month'],
    keySelects:          [`mto.month::text AS month`],
    keyGroupBy:          [`mto.month`],
    availableBreakdowns: ['dynamic_cmg', 'channel', 'customer_type', 'agent', 'brands', 'class_name'],
    availableMetrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers', 'unique_customers'],
    orderBy:             'mto.month',
  },
  cmg: {
    keyHeaders:          ['CMG'],
    keySelects:          [`COALESCE(mto.dynamic_cmg,'Unknown') AS dynamic_cmg`],
    keyGroupBy:          [`COALESCE(mto.dynamic_cmg,'Unknown')`],
    availableBreakdowns: ['month', 'channel', 'customer_type', 'agent', 'brands'],
    availableMetrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers', 'unique_customers'],
    orderBy:             `COALESCE(mto.dynamic_cmg,'Unknown')`,
  },
  customer: {
    keyHeaders:          ['MMID', 'Customer Name'],
    keySelects:          [`mto.mmid`, `COALESCE(l.cust_name,'') AS cust_name`],
    keyGroupBy:          [`mto.mmid`, `COALESCE(l.cust_name,'')`],
    availableBreakdowns: ['month', 'dynamic_cmg', 'channel'],
    availableMetrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers'],
    orderBy:             'mto.mmid',
    needLeads:           true,
  },
  product: {
    keyHeaders:          ['Product Code', 'Product Name', 'Brand'],
    keySelects:          [`mto.prod_num AS product_code`, `COALESCE(mto.product_name_th,'') AS product_name_th`, `COALESCE(mto.brands,'') AS brand`],
    keyGroupBy:          [`mto.prod_num`, `COALESCE(mto.product_name_th,'')`, `COALESCE(mto.brands,'')`],
    availableBreakdowns: ['month', 'dynamic_cmg', 'channel', 'class_name'],
    availableMetrics:    ['hoc_orders', 'hoc_sales', 'qty', 'unique_customers'],
    orderBy:             'mto.prod_num',
  },
  brand: {
    keyHeaders:          ['Brand'],
    keySelects:          [`COALESCE(mto.brands,'Unknown') AS brand`],
    keyGroupBy:          [`COALESCE(mto.brands,'Unknown')`],
    availableBreakdowns: ['month', 'dynamic_cmg', 'channel', 'class_name'],
    availableMetrics:    ['hoc_orders', 'hoc_sales', 'qty', 'unique_customers'],
    orderBy:             `COALESCE(mto.brands,'Unknown')`,
  },
  agent: {
    keyHeaders:          ['Agent'],
    keySelects:          [`COALESCE(mto.agent,'Unknown') AS agent`],
    keyGroupBy:          [`COALESCE(mto.agent,'Unknown')`],
    availableBreakdowns: ['month', 'dynamic_cmg', 'channel'],
    availableMetrics:    ['hoc_orders', 'hoc_sales', 'qty', 'new_customers', 'retention_customers', 'unique_customers'],
    orderBy:             `COALESCE(mto.agent,'Unknown')`,
  },
  order_line: {
    keyHeaders:          [],
    keySelects:          [],
    keyGroupBy:          [],
    availableBreakdowns: [],
    availableMetrics:    [],
    orderBy:             'mto.order_date DESC, mto.order_number',
  },
}

// Raw columns for order_line granularity
const RAW_COLS = [
  { header: 'Order Number',  sql: `mto.order_number::text AS order_number` },
  { header: 'Order Date',    sql: `TO_CHAR(mto.order_date, 'YYYY-MM-DD') AS order_date` },
  { header: 'Month',         sql: `mto.month::text AS month` },
  { header: 'MMID',          sql: `mto.mmid` },
  { header: 'Customer Name', sql: `COALESCE(l.cust_name,'') AS cust_name` },
  { header: 'CMG',           sql: `COALESCE(mto.dynamic_cmg,'') AS dynamic_cmg` },
  { header: 'Channel',       sql: `COALESCE(mto.channel,'') AS channel` },
  { header: 'Customer Type', sql: `mto.customer_type` },
  { header: 'Product Code',  sql: `mto.prod_num AS product_code` },
  { header: 'Product Name',  sql: `COALESCE(mto.product_name_th,'') AS product_name_th` },
  { header: 'Brand',         sql: `COALESCE(mto.brands,'') AS brand` },
  { header: 'Class',         sql: `COALESCE(mto.class_name,'') AS class_name` },
  { header: 'Qty',           sql: `mto.sales_qty::int AS qty` },
  { header: 'Sales (THB)',   sql: `ROUND(mto.sales_in_vat::numeric, 2) AS sales_in_vat` },
  { header: 'Agent',         sql: `COALESCE(mto.agent,'') AS agent` },
  { header: 'Days to Order', sql: `mto.days_to_order` },
]

interface Filters {
  startMonth?:  string  // YYYY-MM-01
  endMonth?:    string  // YYYY-MM-01
  cmg?:         string
  channel?:     string
  customerType?: string
}

interface PivotRequest {
  granularity: string
  columns:     string[]
  filters:     Filters
  format:      'json' | 'csv' | 'xlsx'
}

// ── GET — filter options ───────────────────────────────────────────────────────
export async function GET() {
  return withAuth(async () => {
    const [months, cmgs] = await Promise.all([
      query<{ month: string }>(`
        SELECT DISTINCT month::text AS month
        FROM sales_hoc_orders
        ORDER BY month
      `),
      query<{ cmg: string }>(`
        SELECT DISTINCT COALESCE(dynamic_cmg,'Unknown') AS cmg
        FROM sales_hoc_orders
        ORDER BY cmg
      `),
    ])

    const res = NextResponse.json({
      ok: true,
      data: {
        months:        months.map(r => r.month.slice(0, 7)),  // YYYY-MM
        cmgs:          cmgs.map(r => r.cmg),
        channels:      ['online', 'offline'],
        customerTypes: ['new_customer', 'retention', 'first_order_not_converted', 'retention_not_converted'],
      },
    })
    setCacheHeader(res, 'LONG')
    return res
  })
}

// ── POST — pivot query / export ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as PivotRequest
  const { granularity, columns, filters, format } = body

  // CSV/XLSX export is admin-only; JSON preview is viewer-accessible
  const guard = (format === 'csv' || format === 'xlsx') ? withAdmin : withAuth

  return guard(async () => {

    if (!(granularity in GRANULARITIES)) {
      return NextResponse.json({ error: 'Invalid granularity' }, { status: 400 })
    }

    const gran  = GRANULARITIES[granularity]
    const isRaw = granularity === 'order_line'

    // ── Build WHERE ────────────────────────────────────────────────────────────
    const params: (string | number | null)[] = []
    const conditions: string[] = []

    if (filters.startMonth) {
      params.push(filters.startMonth + '-01')
      conditions.push(`mto.month >= $${params.length}::date`)
    }
    if (filters.endMonth) {
      params.push(filters.endMonth + '-01')
      conditions.push(`mto.month <= $${params.length}::date`)
    }
    if (filters.cmg) {
      params.push(filters.cmg)
      conditions.push(`mto.dynamic_cmg = $${params.length}`)
    }
    if (filters.channel) {
      params.push(filters.channel)
      conditions.push(`mto.channel = $${params.length}`)
    }
    if (filters.customerType) {
      params.push(filters.customerType)
      conditions.push(`mto.customer_type = $${params.length}`)
    }

    const whereSQL  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const needLeads = isRaw || (gran.needLeads ?? false)
    const leadsJoin = needLeads ? `LEFT JOIN leads l ON l.mmid = mto.mmid` : ''

    // ── Build SELECT / GROUP BY ────────────────────────────────────────────────
    let selectSQL: string
    let groupBySQL: string
    let headers: string[]

    if (isRaw) {
      headers   = RAW_COLS.map(c => c.header)
      selectSQL = RAW_COLS.map(c => c.sql).join(', ')
      groupBySQL = ''
    } else {
      const breakdownIds = columns.filter(c => c in BREAKDOWNS && gran.availableBreakdowns.includes(c))
      const metricIds    = columns.filter(c => c in METRICS    && gran.availableMetrics.includes(c))

      if (metricIds.length === 0) {
        return NextResponse.json({ error: 'Select at least one metric column' }, { status: 400 })
      }

      const allSelects = [
        ...gran.keySelects,
        ...breakdownIds.map(id => `${BREAKDOWNS[id].sql} AS ${id}`),
        ...metricIds.map(id => `${METRICS[id].sql} AS ${id}`),
      ]
      selectSQL = allSelects.join(', ')

      const groupByCols = [...gran.keyGroupBy, ...breakdownIds.map(id => BREAKDOWNS[id].groupBy)]
      groupBySQL = `GROUP BY ${groupByCols.join(', ')}`

      headers = [
        ...gran.keyHeaders,
        ...breakdownIds.map(id => BREAKDOWNS[id].header),
        ...metricIds.map(id => METRICS[id].header),
      ]
    }

    const baseSQL = `
      SELECT ${selectSQL}
      FROM sales_hoc_orders mto
      ${leadsJoin}
      ${whereSQL}
      ${groupBySQL}
      ORDER BY ${gran.orderBy}
    `

    // ── JSON preview ───────────────────────────────────────────────────────────
    if (format === 'json') {
      const [rows, countRows] = await Promise.all([
        query<Record<string, unknown>>(`${baseSQL} LIMIT 100`, params),
        query<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM (${baseSQL}) _sub`, params),
      ])
      const total = Number(countRows[0]?.cnt ?? 0)
      return NextResponse.json({ ok: true, headers, data: rows, total })
    }

    // ── CSV export ─────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const rows = await query<Record<string, unknown>>(`${baseSQL} LIMIT 500000`, params)
      const BOM  = '﻿'
      const escape = (v: unknown) => {
        const s = String(v ?? '')
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }
      const lines = [
        headers.join(','),
        ...rows.map(row => Object.values(row).map(escape).join(',')),
      ]
      return new NextResponse(BOM + lines.join('\r\n'), {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="export_${dateStamp()}.csv"`,
        },
      })
    }

    // ── XLSX export ────────────────────────────────────────────────────────────
    if (format === 'xlsx') {
      const limit = isRaw ? 100000 : 500000
      const rows  = await query<Record<string, unknown>>(`${baseSQL} LIMIT ${limit}`, params)

      const ExcelJS  = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Unilever Dashboard'
      workbook.created = new Date()

      const sheet = workbook.addWorksheet('Export Data')
      sheet.addRow(headers)
      sheet.getRow(1).font    = { bold: true }
      sheet.views             = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
      sheet.autoFilter        = { from: 'A1', to: { row: 1, column: headers.length } }

      for (const row of rows) {
        sheet.addRow(Object.values(row).map(v => v ?? ''))
      }

      const numericCols  = new Set(['Orders', 'Qty', 'New Customers', 'Retention Cust.', 'Unique Customers', 'Days to Order'])
      const currencyCols = new Set(['Sales (THB)'])
      headers.forEach((h, i) => {
        const col = sheet.getColumn(i + 1)
        col.width  = Math.max(h.length + 4, 12)
        if (currencyCols.has(h)) col.numFmt = '#,##0.00'
        else if (numericCols.has(h)) col.numFmt = '#,##0'
      })

      const cfg = workbook.addWorksheet('Export Config')
      cfg.addRow(['Export Date',  new Date().toISOString()])
      cfg.addRow(['Granularity',  granularity])
      cfg.addRow(['Total Rows',   rows.length])
      cfg.addRow(['Filters',      JSON.stringify(filters)])
      cfg.addRow(['Columns',      columns.join(', ')])

      const buffer = await workbook.xlsx.writeBuffer()
      return new NextResponse(buffer as ArrayBuffer, {
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="export_${dateStamp()}.xlsx"`,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  })
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}
