export const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(1)}K`
  : n.toFixed(0)

export const fmtBaht = (n: number) => `฿${fmt(n)}`

export const fmtPct = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'
