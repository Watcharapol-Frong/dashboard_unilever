import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth not yet configured — redirect directly to dashboard
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/overview', request.url))
}
