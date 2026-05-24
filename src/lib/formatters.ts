// ── Compact formatters (KPI cards) ───────────────────────────────────────────
export const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)

export const fmtBaht = (n: number) => `฿${fmt(n)}`

// fmtPct: from two counts → "15.0%"
export const fmtPct = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'

// ── Full Thai-locale formatters (tables / detail) ─────────────────────────────
export function formatTHB(value: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('th-TH').format(value)
}

// formatPct: from a 0-1 ratio → "15.0%"
export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatPeriodLabel(period: string, groupBy: 'month' | 'week' | 'day'): string {
  const [y, m, d] = period.split('-').map(Number)
  const date = new Date(y, m - 1, d)

  if (groupBy === 'month') {
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
  }
  if (groupBy === 'week') {
    const end = new Date(date)
    end.setDate(date.getDate() + 6)
    const startStr = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
    const endStr   = `${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`
    return `${startStr}–${endStr}`
  }
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
}

// ── Threshold color helpers ───────────────────────────────────────────────────
// pct: 0-100 scale (e.g. achievement %)
export const colorAchievement = (pct: number) =>
  pct >= 100 ? 'text-green-600' : pct >= 80 ? 'text-yellow-600' : 'text-red-500'

// v: multiplier scale (e.g. ROI 10x)
export const colorRoi = (v: number) =>
  v >= 10 ? 'text-green-600' : v >= 5 ? 'text-yellow-600' : v > 0 ? 'text-red-500' : ''

// v: 0-1 rate; thresholds default to [0.7, 0.5] (reach rate)
export const colorRate = (v: number, thresholds: [number, number] = [0.7, 0.5]) =>
  v >= thresholds[0] ? 'text-green-600' : v >= thresholds[1] ? 'text-yellow-600' : 'text-red-500'
