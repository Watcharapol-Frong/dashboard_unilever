import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Table = 'telesales_calls' | 'online_sales' | 'offline_sales' | 'products'
const ALLOWED_TABLES: Table[] = ['telesales_calls', 'online_sales', 'offline_sales', 'products']

const TABLE_QUERIES: Record<Table, { sql: string; columns: string[] }> = {
  telesales_calls: {
    columns: ['mmid','mobile','first_connected_date','call_status','reason_group','reason_subgroup','agent','lead_customers','updated_at'],
    sql: `SELECT mmid, mobile, first_connected_date::text, call_status,
                 reason_group, reason_subgroup, agent, lead_customers, updated_at::text
          FROM telesales_calls ORDER BY first_connected_date DESC NULLS LAST, mmid`,
  },
  online_sales: {
    columns: ['order_number','order_date','mmid','prod_num','sales_qty','sales_in_vat','dynamic_cmg'],
    sql: `SELECT order_number, order_date::text, mmid, prod_num,
                 sales_qty, sales_in_vat, dynamic_cmg
          FROM online_sales ORDER BY order_date DESC, order_number`,
  },
  offline_sales: {
    columns: ['order_number','order_date','mmid','prod_num','sales_qty','sales_in_vat','dynamic_cmg'],
    sql: `SELECT order_number, order_date::text, mmid, prod_num,
                 sales_qty, sales_in_vat, dynamic_cmg
          FROM offline_sales ORDER BY order_date DESC, order_number`,
  },
  products: {
    columns: ['prod_num','product_name_th','product_name_en','brands','class_name','subclass'],
    sql: `SELECT prod_num, product_name_th, product_name_en,
                 brands, class_name, subclass
          FROM products ORDER BY brands, prod_num`,
  },
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.join(',')
  const body   = rows.map(r => columns.map(c => escape(r[c])).join(',')).join('\n')
  return header + '\n' + body
}

export async function GET(request: Request) {
  return withAdmin(async () => {
    const { searchParams } = new URL(request.url)
    const rawTable = searchParams.get('table') ?? 'telesales_calls'
    const table    = ALLOWED_TABLES.includes(rawTable as Table) ? (rawTable as Table) : 'telesales_calls'

    const { sql, columns } = TABLE_QUERIES[table]
    const rows = await query(sql)

    const csv      = toCsv(columns, rows as Record<string, unknown>[])
    const filename = `${table}_${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  })
}
