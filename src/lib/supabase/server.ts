import type { NextRequest } from 'next/server'

// Supabase removed — auth not yet configured
export function createClient() {
  throw new Error('Auth not configured')
}

export function createServiceClient() {
  throw new Error('Auth not configured')
}

export async function getSessionUserId(_request: NextRequest): Promise<string | null> {
  return null
}

export async function writeAuditLog(_args: {
  userId: string | null
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}) {
  // no-op until auth is configured
}
