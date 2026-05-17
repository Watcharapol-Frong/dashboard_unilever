import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query } from '@/lib/db'

function isAuthorized(request: NextRequest) {
  const auth = request.headers.get('Authorization') ?? ''
  return auth === `Bearer ${process.env.INGEST_API_SECRET}`
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

  // Transform + validate
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

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: records.length })
  }

  // Chunked upsert — 500 rows per chunk
  const CHUNK = 500
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
      values
    )
  }

  return NextResponse.json({ ok: true, inserted: rows.length, skipped: records.length - rows.length })
}
