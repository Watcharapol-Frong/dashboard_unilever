import { createServiceClient } from "@/lib/supabase/server"
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const to   = searchParams.get('to')   ?? new Date().toISOString().split('T')[0]

  const all = await (async () => {
    const supabase = createServiceClient()
    const [onlineRes, offlineRes] = await Promise.all([
      supabase.from('sales_online').select('product_sku, product_brand, qty, sales_amount').gte('order_date', from).lte('order_date', to),
      supabase.from('sales_offline').select('product_sku, product_brand, qty, sales_amount').gte('order_date', from).lte('order_date', to),
    ])
    return [...(onlineRes.data ?? []), ...(offlineRes.data ?? [])]
  })()

  const skuMap = new Map<string, { product_sku: string; product_brand: string | null; qty: number; sales_amount: number }>()
  for (const r of all) {
    if (!skuMap.has(r.product_sku)) skuMap.set(r.product_sku, { product_sku: r.product_sku, product_brand: r.product_brand, qty: 0, sales_amount: 0 })
    const s = skuMap.get(r.product_sku)!
    s.qty += Number(r.qty)
    s.sales_amount += Number(r.sales_amount)
  }

  const total_revenue = all.reduce((s, r) => s + Number(r.sales_amount), 0)
  const by_sku = [...skuMap.values()]
    .map(s => ({ ...s, pct_of_total: total_revenue > 0 ? s.sales_amount / total_revenue : 0 }))
    .sort((a, b) => b.sales_amount - a.sales_amount)

  return NextResponse.json({ by_sku, total_revenue })
}
