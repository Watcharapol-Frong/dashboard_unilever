import { NextResponse } from 'next/server'
import Papa from 'papaparse'
import { listR2Folder, downloadFromR2 } from '@/lib/storage/r2'
import { decrypt } from '@/lib/utils/crypto'
import { transformRows } from '@/lib/upload/etl'
import { FILE_TYPE_CONFIGS } from '@/lib/upload/config'
import type { UploadFileType } from '@/lib/upload/config'
import { query } from '@/lib/db'
import { withAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ALLOWED_TABLES = [
  'online_sales', 'offline_sales', 'leads', 'products',
  'telesales_calls', 'targets', 'costs', 'incentives',
]

function padMmid(val: string): string | null {
  const digits = val.replace(/\D/g, '')
  if (!digits || digits.length > 14) return null
  return digits.padStart(14, '0')
}

function maskMobile(val: string): string | null {
  const digits = val.replace(/\D/g, '')
  if (!digits) return null
  return digits.padStart(10, '0').slice(0, 5) + 'xxxxx'
}

const TABLE_SOURCES: Record<string, { prefix: string; format: 'csv' | 'json'; fileType?: UploadFileType }[]> = {
  online_sales:    [{ prefix: 'order_sales/online/', format: 'csv', fileType: 'online_sales' }],
  offline_sales:   [{ prefix: 'order_sales/offline/', format: 'csv', fileType: 'offline_sales' }],
  leads:           [{ prefix: 'leads/', format: 'csv', fileType: 'leads' }],
  products:        [{ prefix: 'products/', format: 'csv', fileType: 'products' }],
  telesales_calls: [
    { prefix: 'telesales/', format: 'csv', fileType: 'telesales' },
    { prefix: 'leads-activity/', format: 'json' },
  ],
  targets:         [{ prefix: 'targets/', format: 'csv', fileType: 'targets' }],
  costs:           [{ prefix: 'costs/', format: 'csv', fileType: 'costs' }],
  incentives:      [{ prefix: 'incentives/', format: 'csv', fileType: 'incentives' }],
}

async function upsertChunked(
  table: string,
  rows: Record<string, unknown>[],
  conflictKey: string,
  CHUNK = 300,
): Promise<void> {
  if (rows.length === 0) return
  // Drop batch_id (FK to upload_batches — no valid batch for replay)
  // and updated_at (will use NOW() in SQL)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const cleanRows = rows.map(({ batch_id: _b, updated_at: _u, ...rest }) => rest)
  const cols = Object.keys(cleanRows[0])
  const conflictCols = conflictKey.split(',').map(k => k.trim())
  const updateCols = cols.filter(c => !conflictCols.includes(c))

  for (let i = 0; i < cleanRows.length; i += CHUNK) {
    const chunk = cleanRows.slice(i, i + CHUNK)
    const placeholders = chunk.map((_, j) => {
      const b = j * cols.length
      return `(${cols.map((_, ci) => `$${b + ci + 1}`).join(',')},NOW())`
    }).join(',')
    const values = chunk.flatMap(r => cols.map(c => r[c] ?? null))
    await query(
      `INSERT INTO ${table} (${cols.join(',')},updated_at)
       VALUES ${placeholders}
       ON CONFLICT (${conflictKey}) DO UPDATE SET
         ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')},
         updated_at = NOW()`,
      values,
    )
  }
}

export async function POST(request: Request) {
  return withAdmin(async () => {
  const body = await request.json().catch(() => ({}))
  const table = body?.table as string

  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const encryptionKey = process.env.STORAGE_ENCRYPTION_KEY
  if (!encryptionKey) {
    return NextResponse.json({ error: 'Missing encryption key' }, { status: 500 })
  }

  const sources = TABLE_SOURCES[table]
  let totalInserted = 0
  let totalFiles = 0
  const errors: string[] = []

  for (const source of sources) {
    const keys = await listR2Folder(source.prefix)

    for (const key of keys) {
      try {
        const buf       = await downloadFromR2(key)
        const decrypted = decrypt(buf, encryptionKey)
        let rows: Record<string, unknown>[]

        if (source.format === 'json') {
          const { records } = JSON.parse(decrypted) as { records: Record<string, string>[] }
          rows = records.flatMap(r => {
            const mmid = padMmid(r.mmid ?? '')
            if (!mmid) return []
            return [{
              mmid,
              mobile:               maskMobile(r.mobile ?? ''),
              first_connected_date: r.first_connected_date?.trim() || null,
              call_status:          r.call_status?.trim() || null,
              reason_group:         r.reason_group?.trim() || null,
              reason_subgroup:      r.reason_subgroup?.trim() || null,
              contact_note:         r.contact_note?.trim() || null,
              agent:                r.agent?.trim() || null,
              lead_customers:       r.lead_customers?.trim() || null,
            }]
          })
        } else {
          const { data } = Papa.parse<Record<string, string>>(decrypted, {
            header: true, skipEmptyLines: true,
            transformHeader: h => h.trim(),
          })
          const { transformed } = transformRows(data, source.fileType!, key)
          rows = transformed as Record<string, unknown>[]
        }

        const conflictKey = source.fileType
          ? FILE_TYPE_CONFIGS[source.fileType].conflictKey
          : 'mmid'

        await upsertChunked(table, rows, conflictKey)
        totalInserted += rows.length
        totalFiles++
      } catch (err) {
        errors.push(`${key}: ${String(err)}`)
      }
    }
  }

  return NextResponse.json({
    ok:             errors.length === 0,
    replayed_files: totalFiles,
    inserted:       totalInserted,
    errors:         errors.length > 0 ? errors : undefined,
  })
  }) // withAdmin
}
