import Papa from 'papaparse'
import { query, queryOne } from '@/lib/db'
import { uploadToR2, downloadFromR2, deleteFromR2, listR2Folder } from '@/lib/r2'
import { FILE_TYPE_CONFIGS, generateStoragePath, validateHeaders } from '@/lib/upload-config'
import { transformRows } from '@/lib/etl'
import { encrypt } from '@/lib/crypto'
import type { UploadFileType } from '@/lib/upload-config'

const CHUNK = 500

export interface UploadResult {
  ok: boolean
  row_count: number
  error_count: number
  errors: string[]
  storage_path: string
  extra_columns?: string[]
  error?: string
}

export async function processUpload(type: UploadFileType, file: File): Promise<UploadResult> {
  return processUploadFromText(type, await file.text(), file.name)
}

export async function processUploadFromKey(type: UploadFileType, tempKey: string, filename: string, uploadedBy?: string): Promise<UploadResult> {
  const buffer = await downloadFromR2(tempKey)
  await deleteFromR2(tempKey)
  return processUploadFromText(type, buffer.toString('utf-8'), filename, uploadedBy)
}

export async function processUploadFromChunks(type: UploadFileType, uploadId: string, filename: string, uploadedBy?: string): Promise<UploadResult> {
  const keys = (await listR2Folder(`tmp/${uploadId}/`)).sort()
  if (keys.length === 0) throw new Error('No chunks found for upload')
  const buffers = await Promise.all(keys.map(k => downloadFromR2(k)))
  await Promise.all(keys.map(k => deleteFromR2(k)))
  return processUploadFromText(type, Buffer.concat(buffers).toString('utf-8'), filename, uploadedBy)
}

async function processUploadFromText(type: UploadFileType, text: string, filename: string, uploadedBy?: string): Promise<UploadResult> {
  const cfg = FILE_TYPE_CONFIGS[type]
  if (!cfg) throw new Error('Unknown file type')

  // 1. Parse CSV
  const { data: rows, errors: parseErrors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (parseErrors.length > 0) {
    return { 
      ok: false, 
      error: 'CSV parse error', 
      errors: parseErrors.map(e => e.message), 
      row_count: 0, 
      error_count: 0, 
      storage_path: '' 
    }
  }

  if (rows.length === 0) {
    return { 
      ok: false, 
      error: 'File is empty', 
      errors: [], 
      row_count: 0, 
      error_count: 0, 
      storage_path: '' 
    }
  }

  // 2. Validate headers
  const headers = Object.keys(rows[0])
  const { ok, error: headerError, extraColumns } = validateHeaders(headers, type)
  if (!ok) {
    return { 
      ok: false, 
      error: headerError || 'Header validation failed', 
      row_count: 0, 
      error_count: 0, 
      storage_path: '', 
      errors: [] 
    }
  }

  // 3. Upload to R2 (Encrypted)
  const storagePath = generateStoragePath(type)
  const encryptionKey = process.env.STORAGE_ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new Error('Server configuration error (encryption key missing)')
  }

  const encryptedBuffer = encrypt(text, encryptionKey)
  try {
    await uploadToR2(storagePath, encryptedBuffer, 'application/octet-stream')
  } catch (err) {
    console.error(`[upload-service] R2 upload error:`, err)
    throw new Error(`Storage error: ${(err as Error).message}`)
  }

  // 4. Create upload_batch record
  const batch = await queryOne<{ id: string }>(
    `INSERT INTO upload_batches (table_name, filename, storage_path, status, uploaded_by)
     VALUES ($1, $2, $3, 'failed', $4) RETURNING id`,
    [cfg.table, filename, storagePath, uploadedBy ?? null]
  )
  if (!batch) throw new Error('Failed to create batch record')

  // 5. ETL: transform rows
  const { transformed, errors: etlErrors } = transformRows(rows, type, batch.id)

  // 6. Deduplicate + Upsert
  const conflictKey = cfg.conflictKey
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

  let dbError: string | null = null
  for (let i = 0; i < upsertRows.length; i += CHUNK) {
    const chunk = upsertRows.slice(i, i + CHUNK) as Record<string, unknown>[]
    if (chunk.length === 0) continue

    const cols = Object.keys(chunk[0]).filter(c => c !== 'id')
    const conflictCols = conflictKey.split(',').map(k => k.trim())
    const updateCols = cols.filter(c => !conflictCols.includes(c))

    const values: unknown[] = []
    const valuePlaceholders = chunk.map((row) => {
      const rowVals = cols.map(c => { 
        values.push(row[c])
        return `$${values.length}` 
      })
      return `(${rowVals.join(', ')})`
    })

    const onConflict = updateCols.length > 0
      ? `ON CONFLICT (${conflictCols.join(', ')}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
      : `ON CONFLICT (${conflictCols.join(', ')}) DO NOTHING`

    const sql = `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES ${valuePlaceholders.join(', ')} ${onConflict}`
    
    try {
      await query(sql, values)
    } catch (err) {
      console.error(`[upload-service] upsert error at chunk ${i}:`, err)
      dbError = (err as Error).message
      break
    }
  }

  // 7. Update batch status
  const finalStatus = dbError ? 'failed' : etlErrors.length > 0 ? 'partial' : 'success'
  await query(
    `UPDATE upload_batches SET row_count=$1, error_count=$2, status=$3 WHERE id=$4`,
    [upsertRows.length, etlErrors.length, finalStatus, batch.id]
  )

  // ── 8. Update table_summaries — recount from DB to stay accurate after UPSERT dedup ──
  if (!dbError) {
    try {
      const tableName = type === 'telesales' ? 'telesales_calls' : type
      if (type === 'online_sales' || type === 'offline_sales') {
        const [countRes, salesRes] = await Promise.all([
          queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM ${tableName}`),
          queryOne<{ total: string }>(`SELECT COALESCE(SUM(sales_in_vat), 0) AS total FROM ${tableName}`),
        ])
        await query(
          `INSERT INTO table_summaries (table_name, total_rows, total_sales)
           VALUES ($1, $2, $3)
           ON CONFLICT (table_name) DO UPDATE SET
             total_rows   = EXCLUDED.total_rows,
             total_sales  = EXCLUDED.total_sales,
             last_updated = NOW()`,
          [type, Number(countRes?.cnt ?? 0), Number(salesRes?.total ?? 0)]
        )
      } else {
        const countRes = await queryOne<{ cnt: string }>(`SELECT COUNT(*) AS cnt FROM ${tableName}`)
        await query(
          `INSERT INTO table_summaries (table_name, total_rows)
           VALUES ($1, $2)
           ON CONFLICT (table_name) DO UPDATE SET
             total_rows   = EXCLUDED.total_rows,
             last_updated = NOW()`,
          [tableName, Number(countRes?.cnt ?? 0)]
        )
      }
    } catch (err) {
      console.error(`[upload-service] Failed to update table_summaries:`, err)
    }
  }

  if (dbError) {
    return {
      ok: false,
      error: dbError,
      row_count: upsertRows.length,
      error_count: etlErrors.length,
      errors: etlErrors,
      storage_path: storagePath
    }
  }

  return {
    ok: true,
    row_count: upsertRows.length,
    error_count: etlErrors.length,
    errors: etlErrors,
    storage_path: storagePath,
    extra_columns: extraColumns,
  }
}
