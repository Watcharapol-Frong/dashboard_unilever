import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Papa from 'papaparse'
import { createServiceClient, getSessionUserId, writeAuditLog } from '@/lib/supabase/server'
import { FILE_TYPE_CONFIGS, generateStoragePath, validateHeaders } from '@/lib/upload/config'
import { transformRows } from '@/lib/upload/etl'
import { encrypt } from '@/lib/utils/crypto'
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

  // TODO [AUTH]: getSessionUserId will return real user id after Auth is implemented
  const userId = await getSessionUserId(request)

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

  // ── 3. Upload raw CSV to Storage (Encrypted) ─────────────
  const storagePath = generateStoragePath(type)
  const encryptionKey = process.env.STORAGE_ENCRYPTION_KEY
  
  if (!encryptionKey) {
    console.error(`[upload/${type}] Encryption key missing in environment variables`)
    return NextResponse.json({ error: 'Server configuration error (encryption)' }, { status: 500 })
  }

  // Encrypt the raw text before storage
  const encryptedBuffer = encrypt(text, encryptionKey)

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, encryptedBuffer, { 
      upsert: false,
      contentType: 'application/octet-stream' 
    })

  if (storageError) {
    console.error(`[upload/${type}] Step 3 Storage error:`, storageError)
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 })
  }
  console.log(`[upload/${type}] Step 3 OK — storage (encrypted): ${storagePath}`)

  // ── 4. Create upload_batch record ─────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('upload_batches')
    .insert({
      table_name:   cfg.table,
      filename:     file.name,
      storage_path: storagePath,
      status:       'success',
      uploaded_by:  userId,   // null until Auth — TODO [AUTH]: will be real user id
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    console.error(`[upload/${type}] Step 4 batch insert error:`, batchError)
    return NextResponse.json({ error: `Failed to create batch record: ${batchError?.message ?? 'no data returned'}` }, { status: 500 })
  }
  console.log(`[upload/${type}] Step 4 OK — batch id: ${batch.id}`)

  // ── 5. ETL: transform rows ────────────────────────────────
  const { transformed, errors: etlErrors } = transformRows(rows, type, batch.id)

  // ── 6. Upsert to Silver table ─────────────────────────────
  const conflictKey = cfg.conflictKey
  let dbError: string | null = null

  // Deduplicate within the batch by conflict key — keep last occurrence per key.
  // Without this, PostgreSQL throws "ON CONFLICT DO UPDATE cannot affect row a second time"
  // when the same conflict key appears more than once in a single upsert batch.
  let upsertRows = transformed
  if (conflictKey) {
    const keys = conflictKey.split(',').map(k => k.trim())
    const seen = new Map<string, Record<string, unknown>>()
    for (const row of transformed) {
      const composite = keys.map(k => String(row[k] ?? '')).join('|')
      seen.set(composite, row)           // later row overwrites earlier duplicate
    }
    upsertRows = Array.from(seen.values())
  }

  console.log(`[upload/${type}] Step 6 upserting ${upsertRows.length} rows → table: ${cfg.table}`)
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const chunk = upsertRows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from(cfg.table)
      .upsert(chunk, { onConflict: conflictKey })

    if (error) {
      console.error(`[upload/${type}] Step 6 upsert error (chunk ${i}–${i + CHUNK}):`, error)
      dbError = error.message
      break
    }
  }
  if (!dbError) console.log(`[upload/${type}] Step 6 OK`)

  // ── 7. Update batch with final counts ────────────────────
  const dedupCount = upsertRows.length
  await supabase.from('upload_batches').update({
    row_count:   dedupCount,
    error_count: etlErrors.length,
    status:      dbError ? 'failed' : etlErrors.length > 0 ? 'partial' : 'success',
  }).eq('id', batch.id)

  if (dbError) return NextResponse.json({ error: dbError }, { status: 500 })

  // ── 8. Write audit log ────────────────────────────────────
  // TODO [AUTH]: userId will be real user id — audit log will be skipped until then
  await writeAuditLog({
    userId,
    action:     'upload',
    entityType: 'upload_batch',
    entityId:   batch.id,
    metadata: {
      filename:      file.name,
      table_name:    cfg.table,
      row_count:     dedupCount,
      error_count:   etlErrors.length,
      extra_columns: extraColumns,
      storage_path:  storagePath,
    },
  })

  return NextResponse.json({
    ok:            true,
    row_count:     dedupCount,
    error_count:   etlErrors.length,
    errors:        etlErrors,
    storage_path:  storagePath,
    extra_columns: extraColumns,   // columns in file but not in Silver schema (ignored in ETL)
  })
}
