import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServiceClient()

  const { data, count } = await supabase
    .from('online_sales')
    .select('order_number, order_date, sales_qty, sales_in_vat', { count: 'exact' })
    .limit(5)

  const { data: zeroRows } = await supabase
    .from('online_sales')
    .select('order_number', { count: 'exact' })
    .eq('sales_in_vat', 0)

  const { data: nullRows } = await supabase
    .from('online_sales')
    .select('order_number', { count: 'exact' })
    .is('sales_in_vat', null)

  return NextResponse.json({
    total_rows: count,
    zero_sales_in_vat: zeroRows?.length ?? 0,
    null_sales_in_vat: nullRows?.length ?? 0,
    sample: data,
  })
}
