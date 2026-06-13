import { NextResponse } from 'next/server'

// Auth disabled — webhook is a no-op
export async function POST() {
  return NextResponse.json({ received: true })
}
