import { NextResponse } from 'next/server'

// ─── Param parsing ────────────────────────────────────────────────────────────

/** Parse a comma-separated query param into a string array. Returns [] if absent. */
export function parseParam(sp: URLSearchParams, key: string): string[] {
  return (sp.get(key) || '').split(',').filter(Boolean)
}

// ─── Parameterised query building ─────────────────────────────────────────────

/**
 * Push a value onto the params array and return its PostgreSQL positional
 * placeholder (`$1`, `$2`, …).
 */
export function push(params: unknown[], value: unknown): string {
  params.push(value)
  return `$${params.length}`
}

/** Append date-range WHERE conditions to `conds`. No-ops when value is null. */
export function addDateRange(
  params: unknown[],
  conds: string[],
  start: string | null,
  end: string | null,
  col = 'order_date',
): void {
  if (start) conds.push(`${col} >= ${push(params, start)}::date`)
  if (end)   conds.push(`${col} <= ${push(params, end)}::date`)
}

/** Append a `col = ANY($n)` condition. No-op when the array is empty. */
export function addFilter(
  params: unknown[],
  conds: string[],
  values: string[],
  col: string,
): void {
  if (values.length > 0) {
    conds.push(`${col} = ANY(${push(params, values)})`)
  }
}

/** Join conditions into a WHERE clause string (or empty string when there are none). */
export function toWhere(conds: string[], keyword = 'WHERE'): string {
  return conds.length ? `${keyword} ${conds.join(' AND ')}` : ''
}

// ─── Cache-Control presets ────────────────────────────────────────────────────

export const CACHE = {
  /** 1 min CDN / 2 min stale */
  SHORT:  'public, s-maxage=60, stale-while-revalidate=120',
  /** 5 min CDN / 10 min stale — default for most data routes */
  MEDIUM: 'public, s-maxage=300, stale-while-revalidate=600',
  /** 1 h CDN / 2 h stale — stable master data (e.g. product options) */
  LONG:   'public, s-maxage=3600, stale-while-revalidate=7200',
  /** Disable caching — real-time status endpoints */
  NONE:   'no-store',
} as const

export function setCacheHeader(res: NextResponse, preset: keyof typeof CACHE): void {
  res.headers.set('Cache-Control', CACHE[preset])
}
