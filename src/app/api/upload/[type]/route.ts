import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Papa from 'papaparse'
import { createServiceClient } from "@/lib/supabase/server"
import { FILE_TYPE_CONFIGS, generateStoragePath, validateHeaders } from '@/lib/upload/config'
import { transformRows } from '@/lib/upload/etl'
import type { UploadFileType } from '@/lib/upload/config'

const BUCKET = 'csv-uploads'
const CHUNK  = 500

export async function POST(
  request: NextRequest,
  { params }: { params: { type: string } },
) {
  const type = params.type as UploadFileType
  const cfg  = FILE_TYPE_CONFIGS[type]
  if (!cfg) return NextResponse.json({ error: 'Unknown file type' }, { status: 400 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const text = await file.text()
  const supabase = createServiceClient()

  // ── 1. Parse CSV ──────────────────────────────────────────
  const { data: rows, errors: parseErrors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (parseErrors.length > 0) {
    return NextResponse.json({ error: 'CSV parse error', details: parseErrors.map(e => e.message) }, { status: 422 })
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 422 })
  }

  // ── 2. Validate headers ───────────────────────────────────
  // Extra columns beyond schemaHeaders are allowed — they get stored in Storage
  // but are silently ignored during ETL (not imported to Silver table)
  const headers = Object.keys(rows[0])
  const { ok, error: headerError, extraColumns } = validateHeaders(headers, type)
  if (!ok) return NextResponse.json({ error: headerError }, { status: 422 })

  // ── 3. Upload raw CSV to Storage ──────────────────────────
  const storagePath = generateStoragePath(type)
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Blob([text], { type: 'text/csv' }), { upsert: false })

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 })
  }

  // ── 4. Create upload_batch record ─────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('upload_batches')
    .insert({
      table_name:   cfg.table,
      filename:     file.name,
      storage_path: storagePath,
      status:       'success',
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return NextResponse.json({ error: 'Failed to create batch record' }, { status: 500 })
  }

  // ── 5. ETL: transform rows ────────────────────────────────
  const { transformed, errors: etlErrors } = transformRows(rows, type, batch.id)

  // ── 6. Upsert to Silver table ─────────────────────────────
  const conflictKey = cfg.conflictKey
  let dbError: string | null = null

  for (let i = 0; i < transformed.length; i += CHUNK) {
    const chunk = transformed.slice(i, i + CHUNK)
    const { error } = await supabase
      .from(cfg.table)
      .upsert(chunk, { onConflict: conflictKey })

    if (error) { dbError = error.message; break }
  }

  // ── 7. Update batch with final counts ────────────────────
  await supabase.from('upload_batches').update({
    row_count:   transformed.length,
    error_count: etlErrors.length,
    status:      dbError ? 'failed' : etlErrors.length > 0 ? 'partial' : 'success',
  }).eq('id', batch.id)

  if (dbError) return NextResponse.json({ error: dbError }, { status: 500 })

  return NextResponse.json({
    ok:            true,
    row_count:     transformed.length,
    error_count:   etlErrors.length,
    errors:        etlErrors.slice(0, 20),
    storage_path:  storagePath,
    extra_columns: extraColumns,   // columns in file but not in Silver schema (ignored in ETL)
  })
}
