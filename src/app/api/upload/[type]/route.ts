import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Papa from 'papaparse'
import { query, queryOne } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { FILE_TYPE_CONFIGS, generateStoragePath, validateHeaders } from '@/lib/upload/config'
import { transformRows } from '@/lib/upload/etl'
import { encrypt } from '@/lib/utils/crypto'
import type { UploadFileType } from '@/lib/upload/config'

const CHUNK = 500

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
  const headers = Object.keys(rows[0])
  const { ok, error: headerError, extraColumns } = validateHeaders(headers, type)
  if (!ok) return NextResponse.json({ error: headerError }, { status: 422 })

  // ── 3. Upload raw CSV to R2 (Encrypted) ──────────────────
  const storagePath = generateStoragePath(type)
  const encryptionKey = process.env.STORAGE_ENCRYPTION_KEY
  if (!encryptionKey) {
    return NextResponse.json({ error: 'Server configuration error (encryption)' }, { status: 500 })
  }

  const encryptedBuffer = encrypt(text, encryptionKey)

  try {
    await uploadToR2(storagePath, encryptedBuffer, 'application/octet-stream')
  } catch (err) {
    console.error(`[upload/${type}] R2 upload error:`, err)
    return NextResponse.json({ error: `Storage error: ${(err as Error).message}` }, { status: 500 })
  }
  console.log(`[upload/${type}] Step 3 OK — R2: ${storagePath}`)

  // ── 4. Create upload_batch record ─────────────────────────
  const batch = await queryOne<{ id: string }>(
    `INSERT INTO upload_batches (table_name, filename, storage_path, status)
     VALUES ($1, $2, $3, 'success') RETURNING id`,
    [cfg.table, file.name, storagePath]
  )
  if (!batch) {
    return NextResponse.json({ error: 'Failed to create batch record' }, { status: 500 })
  }
  console.log(`[upload/${type}] Step 4 OK — batch id: ${batch.id}`)

  // ── 5. ETL: transform rows ────────────────────────────────
  const { transformed, errors: etlErrors } = transformRows(rows, type, batch.id)

  // ── 6. Deduplicate + Upsert to Silver table ───────────────
  const conflictKey = cfg.conflictKey
  let dbError: string | null = null
  let upsertRows = transformed

  if (conflictKey) {
    const keys = conflictKey.split(',').map(k => k.trim())
    const seen = new Map<string, Record<string, unknown>>()
    for (const row of transformed) {
      const composite = keys.map(k => String((row as Record<string,unknown>)[k] ?? '')).join('|')
      seen.set(composite, row as Record<string, unknown>)
    }
    upsertRows = Array.from(seen.values()) as typeof transformed
  }

  console.log(`[upload/${type}] Step 6 upserting ${upsertRows.length} rows → table: ${cfg.table}`)

  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const chunk = upsertRows.slice(i, i + CHUNK) as Record<string, unknown>[]
    if (chunk.length === 0) continue

    const cols    = Object.keys(chunk[0]).filter(c => c !== 'id')
    const conflictCols = conflictKey.split(',').map(k => k.trim())
    const updateCols   = cols.filter(c => !conflictCols.includes(c))

    // Build multi-row VALUES
    const values: unknown[] = []
    const valuePlaceholders = chunk.map((row) => {
      const rowVals = cols.map(c => { values.push(row[c]); return `$${values.length}` })
      return `(${rowVals.join(', ')})`
    })

    const onConflict = updateCols.length > 0
      ? `ON CONFLICT (${conflictCols.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
      : `ON CONFLICT (${conflictCols.join(', ')}) DO NOTHING`

    const sql = `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES ${valuePlaceholders.join(', ')} ${onConflict}`

    try {
      await query(sql, values)
    } catch (err) {
      console.error(`[upload/${type}] upsert error (chunk ${i}):`, err)
      dbError = (err as Error).message
      break
    }
  }
  if (!dbError) console.log(`[upload/${type}] Step 6 OK`)

  // ── 7. Update batch with final counts ────────────────────
  const finalStatus = dbError ? 'failed' : etlErrors.length > 0 ? 'partial' : 'success'
  await query(
    `UPDATE upload_batches SET row_count=$1, error_count=$2, status=$3 WHERE id=$4`,
    [upsertRows.length, etlErrors.length, finalStatus, batch.id]
  )

  if (dbError) return NextResponse.json({ error: dbError }, { status: 500 })

  return NextResponse.json({
    ok:            true,
    row_count:     upsertRows.length,
    error_count:   etlErrors.length,
    errors:        etlErrors,
    storage_path:  storagePath,
    extra_columns: extraColumns,
  })
}
