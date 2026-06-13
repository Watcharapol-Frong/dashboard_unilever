import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withAuth } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i

const SYSTEM_PROMPT = `You are an analytics assistant for Unilever HOC (House of Commerce) telesales programme on Makro Pro platform. You answer questions about sales, telesales performance, and agent metrics using real data from the database.

## Database Schema

### mart_performance_cmg (pre-aggregated, month × CMG grain)
- month: date (first day of month)
- dynamic_cmg: text (CMG group: 'FOOD RETAILER', 'HORECA', 'END USER', 'DISTRIBUTOR')
- total_calls: int (telesales calls made)
- reached: int (calls where customer answered)
- ordered: int (customers who placed an order)
- new_customers: int (first-time HOC buyers within attribution window)
- retention: int (repeat HOC buyers within attribution window)
- hoc_orders: int (total HOC orders)
- hoc_sales: decimal (HOC sales amount in THB, VAT included)
- sales_target: decimal (monthly sales target in THB)
- achievement_ratio: decimal (hoc_sales / sales_target)
- total_incentive: decimal (incentive paid to agents in THB)
- total_agent_cost: decimal (agent salary cost in THB)
- total_expense: decimal (total_incentive + total_agent_cost)
- roi: decimal (hoc_sales / total_expense)

### mart_performance_month (pre-aggregated, month grain — costs & ROI)
- month: date
- total_incentive: decimal
- total_agent_cost: decimal
- total_expense: decimal
- roi: decimal

### sales_hoc_orders (row-level fact table — one row per order line)
- mmid: text (customer ID)
- order_number: text
- order_date: date
- month: date (first day of the order month)
- channel: text ('online' or 'offline')
- dynamic_cmg: text
- primary_cmg: text
- prod_num: text
- sales_in_vat: decimal (THB)
- sales_qty: int
- customer_type: text (one of: 'new_customer', 'retention', 'first_order_not_converted', 'retention_not_converted')
- agent: text (telesales agent name)
- days_to_order: int (days from first telesales call to order)
- refreshed_at: timestamp

### telesales_calls (source table — one row per customer)
- mmid: text (PK)
- mobile: text
- first_connected_date: date
- call_status: text
- reason_group: text
- reason_subgroup: text
- agent: text
- lead_customers: int

## Metric Definitions
- **Converted** = customer_type IN ('new_customer','retention') — ordered within 30-day attribution window after call
- **Not Converted** = customer_type IN ('first_order_not_converted','retention_not_converted')
- **Reached** = customer answered the call (excludes: ไม่รับสาย%, ปิดเครื่อง/ติดต่อไม่ได้)
- **New Customer** = first HOC order within attribution window
- **Retention** = repeat HOC order within attribution window
- **HOC Sales** = sales_in_vat where customer_type IN ('new_customer','retention')
- **ROI** = HOC Sales / Total Expense
- **Achievement** = HOC Sales / Sales Target

## Response Rules
1. Always query the database for specific numbers — never make up figures
2. When showing numbers in text, format: sales as "2.3M บาท", percentages as "45.2%", counts with commas
3. Use render_chart when showing trends, comparisons, or distributions
4. Prefer bar charts for comparisons, line charts for trends over time, pie charts for proportions
5. Answer in the same language the user asks (Thai or English)
6. Keep text responses concise — let the chart do the heavy lifting`

const tools: Anthropic.Tool[] = [
  {
    name: 'query_database',
    description:
      "Query the analytics database to get data needed to answer the user's question. Use SELECT queries only on the available mart tables.",
    input_schema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SELECT query to run',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'render_chart',
    description:
      'Render a chart visualization. Call this after query_database to display data as a chart.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['bar', 'line', 'pie'],
          description: 'Chart type',
        },
        title: {
          type: 'string',
          description: 'Chart title',
        },
        xKey: {
          type: 'string',
          description: 'Column name for x-axis/label',
        },
        yKey: {
          type: 'string',
          description: 'Column name for y-axis/value',
        },
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'The actual data to render',
        },
      },
      required: ['type', 'title', 'xKey', 'yKey', 'data'],
    },
  },
]

type ChartPayload = {
  type: 'bar' | 'line' | 'pie'
  title: string
  xKey: string
  yKey: string
  data: Record<string, unknown>[]
}

async function runDbQuery(sql: string): Promise<{ rows?: Record<string, unknown>[]; error?: string }> {
  if (FORBIDDEN_KEYWORDS.test(sql)) {
    return { error: 'Only SELECT queries are allowed' }
  }
  try {
    const wrapped = `SELECT * FROM (${sql}) AS _q LIMIT 500`
    const rows = await query<Record<string, unknown>>(wrapped)
    return { rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Database error' }
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withAuth(async () => {
    const body = await req.json().catch(() => null)
    const message: unknown = body?.message
    const history: unknown = body?.history

    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }

    const client = new Anthropic()

    // Build messages array from history + current user message
    const historyMessages: Anthropic.MessageParam[] = Array.isArray(history)
      ? (history as Array<{ role: string; content: string }>)
          .filter(
            (m) =>
              typeof m === 'object' &&
              m !== null &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
          )
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      : []

    const messages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: message.trim() },
    ]

    let chart: ChartPayload | undefined
    let responseText = ''

    // Tool-use loop — runs until Claude signals end_turn
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const response = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      })

      // Collect any text blocks
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text
        }
      }

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
        // Append assistant turn with all content blocks
        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue

          if (block.name === 'query_database') {
            const input = block.input as { sql?: unknown }
            const sql = typeof input.sql === 'string' ? input.sql : ''
            // eslint-disable-next-line no-await-in-loop
            const result = await runDbQuery(sql)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            })
          } else if (block.name === 'render_chart') {
            const input = block.input as ChartPayload
            chart = {
              type: input.type,
              title: input.title,
              xKey: input.xKey,
              yKey: input.yKey,
              data: input.data,
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ ok: true }),
            })
          }
        }

        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // Any other stop reason — exit loop
      break
    }

    return NextResponse.json({ text: responseText, chart })
  })
}
