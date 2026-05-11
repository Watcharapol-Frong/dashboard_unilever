import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        // Bypass Next.js fetch cache so API routes always read fresh data from Supabase
        fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  )
}

// ── Auth helpers (placeholders — will use real session after Auth is implemented) ──

/**
 * Returns the current user's ID from the session JWT.
 * TODO [AUTH]: replace stub with real session extraction:
 *   const token = request.headers.get('Authorization')?.replace('Bearer ', '')
 *   const { data } = await createClient().auth.getUser(token)
 *   return data.user?.id ?? null
 */
export async function getSessionUserId(_request: NextRequest): Promise<string | null> {
  // Stub — always returns null until Auth is implemented
  return null
}

/**
 * Writes one record to audit_logs.
 * TODO [AUTH]: this will be called with real user_id once Auth is implemented.
 */
export async function writeAuditLog({
  userId,
  action,
  entityType,
  entityId,
  metadata,
}: {
  userId: string | null
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}) {
  if (!userId) return   // skip audit log when no session (pre-auth)
  const supabase = createServiceClient()
  await supabase.from('audit_logs').insert({
    user_id:     userId,
    action,
    entity_type: entityType,
    entity_id:   entityId,
    metadata,
  })
}
