import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { setCacheHeader } from '@/lib/query'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 200

type Table = 'telesales_calls' | 'online_sales' | 'offline_sales' | 'products'

const ALLOWED_TABLES: Table[] = ['telesales_calls', 'online_sales', 'offline_sales', 'products']

function buildQuery(table: Table, search: string | null, limit: number, offset: number) {
  const params: unknown[] = []
  const push = (v: unknown) => { params.push(v); return `$${params.length}` }

  switch (table) {
    case 'telesales_calls': {
      const searchCond = search
        ? `AND (mmid ILIKE ${push(`%${search}%`)} OR agent ILIKE ${push(`%${search}%`)})`
        : ''
      return {
        dataSql: `
          SELECT mmid, mobile, first_connected_date::text, call_status,
                 reason_group, reason_subgroup, agent, lead_customers,
                 updated_at::text
          FROM telesales_calls
          WHERE true ${searchCond}
          ORDER BY first_connected_date DESC NULLS LAST, mmid
          LIMIT ${push(limit)} OFFSET ${push(offset)}
        `,
        countSql: `SELECT COUNT(*)::text AS cnt FROM telesales_calls WHERE true ${searchCond}`,
        params,
        columns: ['mmid','mobile','first_connected_date','call_status','reason_group','reason_subgroup','agent','lead_customers','updated_at'],
      }
    }

    case 'online_sales': {
      const searchCond = search
        ? `AND (order_number ILIKE ${push(`%${search}%`)} OR mmid ILIKE ${push(`%${search}%`)})`
        : ''
      return {
        dataSql: `
          SELECT order_number, order_date::text, mmid, prod_num,
                 sales_qty, sales_in_vat, dynamic_cmg
          FROM online_sales
          WHERE true ${searchCond}
          ORDER BY order_date DESC, order_number
          LIMIT ${push(limit)} OFFSET ${push(offset)}
        `,
        countSql: `SELECT COUNT(*)::text AS cnt FROM online_sales WHERE true ${searchCond}`,
        params,
        columns: ['order_number','order_date','mmid','prod_num','sales_qty','sales_in_vat','dynamic_cmg'],
      }
    }

    case 'offline_sales': {
      const searchCond = search
        ? `AND (order_number ILIKE ${push(`%${search}%`)} OR mmid ILIKE ${push(`%${search}%`)})`
        : ''
      return {
        dataSql: `
          SELECT order_number, order_date::text, mmid, prod_num,
                 sales_qty, sales_in_vat, dynamic_cmg
          FROM offline_sales
          WHERE true ${searchCond}
          ORDER BY order_date DESC, order_number
          LIMIT ${push(limit)} OFFSET ${push(offset)}
        `,
        countSql: `SELECT COUNT(*)::text AS cnt FROM offline_sales WHERE true ${searchCond}`,
        params,
        columns: ['order_number','order_date','mmid','prod_num','sales_qty','sales_in_vat','dynamic_cmg'],
      }
    }

    case 'products': {
      const searchCond = search
        ? `AND (prod_num ILIKE ${push(`%${search}%`)} OR product_name_th ILIKE ${push(`%${search}%`)} OR product_name_en ILIKE ${push(`%${search}%`)} OR brands ILIKE ${push(`%${search}%`)})`
        : ''
      return {
        dataSql: `
          SELECT prod_num, product_name_th, product_name_en,
                 brands, class_name, subclass
          FROM products
          WHERE true ${searchCond}
          ORDER BY brands, prod_num
          LIMIT ${push(limit)} OFFSET ${push(offset)}
        `,
        countSql: `SELECT COUNT(*)::text AS cnt FROM products WHERE true ${searchCond}`,
        params,
        columns: ['prod_num','product_name_th','product_name_en','brands','class_name','subclass'],
      }
    }
  }
}

export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url)
    const rawTable = searchParams.get('table') ?? 'telesales_calls'
    const table    = ALLOWED_TABLES.includes(rawTable as Table) ? (rawTable as Table) : 'telesales_calls'
    const search   = searchParams.get('search')?.trim() || null
    const page     = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit    = Math.min(PAGE_SIZE, Math.max(1, Number(searchParams.get('limit') ?? PAGE_SIZE)))
    const offset   = (page - 1) * limit

    const { dataSql, countSql, params, columns } = buildQuery(table, search, limit, offset)

    // Count params are a prefix of data params — split at the right index
    const countParamCount = params.length - 2 // limit + offset are last 2
    const countParams     = params.slice(0, countParamCount)

    const [rows, countRow] = await Promise.all([
      query(dataSql, params),
      query<{ cnt: string }>(countSql, countParams),
    ])

    const total = Number(countRow[0]?.cnt ?? 0)

    const res = NextResponse.json({
      ok: true,
      table,
      columns,
      data:  rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    })
    setCacheHeader(res, 'SHORT')
    return res
  })
}
