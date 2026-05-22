import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomBytes, timingSafeEqual } from 'crypto'
import { query } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { encrypt } from '@/lib/utils/crypto'

function isAuthorized(request: NextRequest) {
  const provided = request.headers.get('Authorization') ?? ''
  const expected = `Bearer ${process.env.INGEST_API_SECRET ?? ''}`
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

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

interface IngestRecord {
  mmid?: string
  mobile?: string
  first_connected_date?: string
  call_status?: string
  reason_group?: string
  reason_subgroup?: string
  contact_note?: string
  agent?: string
  lead_customers?: string
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { records: IngestRecord[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const records = body?.records
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: 'records must be a non-empty array' }, { status: 400 })
  }

  // ── 1. Transform + validate (PDPA enforced here) ──────────
  const rows = records.flatMap(r => {
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

  const skipped = records.length - rows.length
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped })
  }

  // ── 2. Encrypt + upload raw payload to R2 (disaster recovery) ──
  const encryptionKey = process.env.STORAGE_ENCRYPTION_KEY
  if (!encryptionKey) {
    return NextResponse.json({ error: 'Server configuration error (encryption)' }, { status: 500 })
  }

  const datePart  = new Date().toISOString().slice(0, 10)
  const token     = randomBytes(8).toString('hex')
  const r2Key     = `leads-activity/${datePart}_${token}.json`
  const payload   = JSON.stringify({ ingested_at: new Date().toISOString(), records })
  const encrypted = encrypt(payload, encryptionKey)

  try {
    await uploadToR2(r2Key, encrypted)
  } catch (err) {
    console.error('[ingest/telesales-activity] R2 upload failed:', err)
    return NextResponse.json({ error: 'Storage backup failed' }, { status: 500 })
  }

  // ── 3. Chunked upsert → telesales_calls ──────────────────
  const CHUNK = 500
  let dbError: string | null = null

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const placeholders = chunk.map((_, j) => {
      const b = j * 9
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},NOW())`
    }).join(',')
    const values = chunk.flatMap(r => [
      r.mmid, r.mobile, r.first_connected_date, r.call_status,
      r.reason_group, r.reason_subgroup, r.contact_note, r.agent, r.lead_customers,
    ])
    try {
      await query(
        `INSERT INTO telesales_calls
           (mmid, mobile, first_connected_date, call_status, reason_group,
            reason_subgroup, contact_note, agent, lead_customers, updated_at)
         VALUES ${placeholders}
         ON CONFLICT (mmid) DO UPDATE SET
           mobile               = EXCLUDED.mobile,
           first_connected_date = EXCLUDED.first_connected_date,
           call_status          = EXCLUDED.call_status,
           reason_group         = EXCLUDED.reason_group,
           reason_subgroup      = EXCLUDED.reason_subgroup,
           contact_note         = EXCLUDED.contact_note,
           agent                = EXCLUDED.agent,
           lead_customers       = EXCLUDED.lead_customers,
           updated_at           = NOW()`,
        values,
      )
    } catch (err) {
      dbError = String(err)
      break
    }
  }

  if (dbError) {
    console.error('[ingest/telesales-activity] DB upsert failed:', dbError)
    return NextResponse.json({ error: 'DB upsert failed', detail: dbError }, { status: 500 })
  }

  // ── 4. Record batch (after upsert succeeds) ───────────────
  await query(
    `INSERT INTO upload_batches (table_name, filename, storage_path, row_count, status)
     VALUES ('telesales_calls', $1, $2, $3, 'success')`,
    [`gas_${datePart}_${token}.json`, r2Key, rows.length],
  )

  // ── 5. Sync table_summaries ───────────────────────────────
  await query(
    `INSERT INTO table_summaries (table_name, total_rows)
     SELECT 'telesales_calls', COUNT(*) FROM telesales_calls
     ON CONFLICT (table_name) DO UPDATE SET
       total_rows   = EXCLUDED.total_rows,
       last_updated = NOW()`
  )

  return NextResponse.json({ ok: true, inserted: rows.length, skipped, storage_path: r2Key })
}
