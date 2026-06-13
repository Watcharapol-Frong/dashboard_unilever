import { NextResponse } from 'next/server'

// Auth disabled — registration is unavailable
export async function POST() {
  return NextResponse.json({ error: 'Registration is disabled in preview mode' }, { status: 503 })
}
