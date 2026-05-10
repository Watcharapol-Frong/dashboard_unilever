import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { parseCSV } from '@/lib/csv/parser'
import type { FileType } from '@/types'

const TABLE_MAP: Record<FileType, string> = {
  sales_online: 'sales_online',
  sales_offline: 'sales_offline',
  telesales_call_log: 'telesales_calls',
  lead_list: 'leads',
  product_list: 'product_list',
  incentive: 'incentives',
  target: 'targets',
}

const UPSERT_CONFLICT: Partial<Record<FileType, string>> = {
  sales_online: 'order_id',
  sales_offline: 'order_id',
  product_list: 'product_sku',
}

export async function POST(request: NextRequest, { params }: { params: { type: string } }) {
  const fileType = params.type as FileType
  if (!TABLE_MAP[fileType]) return NextResponse.json({ error: 'Unknown file type' }, { status: 400 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const columnMapRaw = formData.get('columnMap') as string | null
  const columnMap = columnMapRaw ? JSON.parse(columnMapRaw) : {}

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const { valid, errors } = parseCSV(text, fileType, columnMap)

  if (valid.length === 0) {
    return NextResponse.json({ error: 'No valid rows parsed', errors }, { status: 422 })
  }

  const supabase = createServiceClient()

  const { data: batch } = await supabase
    .from('upload_batches')
    .insert({ type: fileType, filename: file.name, row_count: valid.length, error_count: errors.length })
    .select('id')
    .single()

  const rows = valid.map(r => ({ ...r, upload_batch: batch?.id }))
  const conflictKey = UPSERT_CONFLICT[fileType]
  const table = TABLE_MAP[fileType]

  let dbError
  if (conflictKey) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictKey })
    dbError = error
  } else {
    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK))
      if (error) { dbError = error; break }
    }
  }

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ ok: true, row_count: valid.length, error_count: errors.length, errors: errors.slice(0, 20) })
}
