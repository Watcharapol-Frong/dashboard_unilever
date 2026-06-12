'use client'

import { useState, useMemo } from 'react'

export function lastDayOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0]
}

export function formatRangeLabel(from: string | null, to: string | null): string | null {
  if (!from) return null
  const f = new Date(from).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  if (!to) return f
  return `${f} – ${new Date(to).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
}

export function useMonthRange() {
  const lastMonth = useMemo(() => {
    const d = new Date()
    // If today is e.g. June 12, 2026, we want "2026-05"
    d.setMonth(d.getMonth() - 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }, [])

  const [rangeFrom, setRangeFrom] = useState<string | null>(lastMonth)
  const [rangeTo,   setRangeTo]   = useState<string | null>(null)
  const [hoverMonth, setHoverMonth] = useState<string | null>(null)

  const handleChipClick = (m: string) => {
    if (!rangeFrom || (rangeFrom && rangeTo)) {
      setRangeFrom(m); setRangeTo(null)
    } else if (m === rangeFrom) {
      setRangeFrom(null); setRangeTo(null)
    } else if (m < rangeFrom) {
      setRangeFrom(m); setRangeTo(rangeFrom)
    } else {
      setRangeTo(m)
    }
  }

  const clearRange = () => { setRangeFrom(null); setRangeTo(null) }

  const activeRangeLabel = useMemo(() => formatRangeLabel(rangeFrom, rangeTo), [rangeFrom, rangeTo])

  const effectiveStart = rangeFrom ? `${rangeFrom}-01` : null
  const effectiveEnd   = rangeFrom ? lastDayOfMonth(rangeTo ?? rangeFrom) : null

  return {
    rangeFrom, rangeTo, hoverMonth,
    setRangeFrom, setRangeTo, setHoverMonth,
    handleChipClick, clearRange,
    activeRangeLabel,
    effectiveStart, effectiveEnd,
  }
}
