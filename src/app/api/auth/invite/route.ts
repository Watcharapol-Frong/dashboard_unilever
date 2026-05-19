import { NextResponse } from 'next/server'

// Auth/invite not yet configured — placeholder until auth system is added
export async function POST() {
  return NextResponse.json({ error: 'Auth not configured' }, { status: 501 })
}
