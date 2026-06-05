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
  const [rangeFrom, setRangeFrom] = useState<string | null>(null)
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

  const effectiveStart = rangeFrom
  const effectiveEnd   = rangeFrom ? lastDayOfMonth(rangeTo ?? rangeFrom) : null

  return {
    rangeFrom, rangeTo, hoverMonth,
    setRangeFrom, setRangeTo, setHoverMonth,
    handleChipClick, clearRange,
    activeRangeLabel,
    effectiveStart, effectiveEnd,
  }
}
