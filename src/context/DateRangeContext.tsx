'use client'
import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  subMonths, addMonths,
  subWeeks, addWeeks,
  isAfter, isSameMonth, isSameWeek,
} from 'date-fns'
import type { DateRange } from '@/types'

export type PeriodMode = 'month' | 'week'

interface PeriodContextValue {
  mode: PeriodMode
  setMode: (m: PeriodMode) => void
  anchor: Date
  range: DateRange
  prevRange: DateRange
  navigatePrev: () => void
  navigateNext: () => void
  canNavigateNext: boolean
}

// Week = Sun–Sat
const WEEK_OPTS = { weekStartsOn: 0 } as const

function computeRanges(mode: PeriodMode, anchor: Date): { range: DateRange; prevRange: DateRange } {
  const today = new Date()

  if (mode === 'month') {
    const from    = startOfMonth(anchor)
    const rawTo   = endOfMonth(anchor)
    const to      = isAfter(rawTo, today) ? today : rawTo

    const prevAnchor = subMonths(anchor, 1)
    const prevFrom   = startOfMonth(prevAnchor)
    const prevRawTo  = endOfMonth(prevAnchor)
    const prevTo     = isAfter(prevRawTo, today) ? today : prevRawTo

    return { range: { from, to }, prevRange: { from: prevFrom, to: prevTo } }
  }

  // week
  const from    = startOfWeek(anchor, WEEK_OPTS)
  const rawTo   = endOfWeek(anchor, WEEK_OPTS)
  const to      = isAfter(rawTo, today) ? today : rawTo

  const prevAnchor = subWeeks(anchor, 1)
  const prevFrom   = startOfWeek(prevAnchor, WEEK_OPTS)
  const prevRawTo  = endOfWeek(prevAnchor, WEEK_OPTS)
  const prevTo     = isAfter(prevRawTo, today) ? today : prevRawTo

  return { range: { from, to }, prevRange: { from: prevFrom, to: prevTo } }
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<PeriodMode>('month')
  const [anchor, setAnchor]  = useState<Date>(new Date())

  const { range, prevRange } = useMemo(() => computeRanges(mode, anchor), [mode, anchor])

  const canNavigateNext = useMemo(() => {
    const today = new Date()
    if (mode === 'month') return !isSameMonth(anchor, today) && !isAfter(anchor, today)
    return !isSameWeek(anchor, today, WEEK_OPTS)
  }, [mode, anchor])

  const navigatePrev = useCallback(() => {
    setAnchor(a => mode === 'month' ? subMonths(a, 1) : subWeeks(a, 1))
  }, [mode])

  const navigateNext = useCallback(() => {
    if (!canNavigateNext) return
    setAnchor(a => mode === 'month' ? addMonths(a, 1) : addWeeks(a, 1))
  }, [mode, canNavigateNext])

  const setMode = useCallback((m: PeriodMode) => {
    setModeState(m)
    setAnchor(new Date())
  }, [])

  return (
    <PeriodContext.Provider value={{ mode, setMode, anchor, range, prevRange, navigatePrev, navigateNext, canNavigateNext }}>
      {children}
    </PeriodContext.Provider>
  )
}

export function useDateRange() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}
