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

export type PeriodMode = 'month' | 'week' | 'custom'
export type GroupBy = 'month' | 'week' | 'day'

interface PeriodContextValue {
  mode: PeriodMode
  setMode: (m: PeriodMode) => void
  anchor: Date
  groupBy: GroupBy
  range: DateRange
  prevRange: DateRange
  navigatePrev: () => void
  navigateNext: () => void
  canNavigateNext: boolean
  // custom mode
  customRange: DateRange
  setCustomRange: (r: DateRange) => void
}

const WEEK_OPTS = { weekStartsOn: 0 } as const  // Sun–Sat

function computeRanges(mode: PeriodMode, anchor: Date, custom: DateRange): { range: DateRange; prevRange: DateRange } {
  const today = new Date()

  if (mode === 'custom') {
    const duration = custom.to.getTime() - custom.from.getTime()
    const prevTo   = new Date(custom.from.getTime() - 86_400_000)
    const prevFrom = new Date(prevTo.getTime() - duration)
    return { range: custom, prevRange: { from: prevFrom, to: prevTo } }
  }

  if (mode === 'month') {
    const from   = startOfMonth(anchor)
    const to     = isAfter(endOfMonth(anchor), today) ? today : endOfMonth(anchor)
    const prev   = subMonths(anchor, 1)
    const pFrom  = startOfMonth(prev)
    const pTo    = isAfter(endOfMonth(prev), today) ? today : endOfMonth(prev)
    return { range: { from, to }, prevRange: { from: pFrom, to: pTo } }
  }

  // week (Sun–Sat)
  const from  = startOfWeek(anchor, WEEK_OPTS)
  const to    = isAfter(endOfWeek(anchor, WEEK_OPTS), today) ? today : endOfWeek(anchor, WEEK_OPTS)
  const prev  = subWeeks(anchor, 1)
  const pFrom = startOfWeek(prev, WEEK_OPTS)
  const pTo   = isAfter(endOfWeek(prev, WEEK_OPTS), today) ? today : endOfWeek(prev, WEEK_OPTS)
  return { range: { from, to }, prevRange: { from: pFrom, to: pTo } }
}

const PeriodContext = createContext<PeriodContextValue | null>(null)

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState]     = useState<PeriodMode>('month')
  const [anchor, setAnchor]      = useState<Date>(new Date())
  const [customRange, setCustomRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to:   new Date(),
  })

  const { range, prevRange } = useMemo(
    () => computeRanges(mode, anchor, customRange),
    [mode, anchor, customRange]
  )

  const groupBy = useMemo((): GroupBy => {
    if (mode === 'month') return 'month'
    if (mode === 'week')  return 'week'
    const days = Math.round((customRange.to.getTime() - customRange.from.getTime()) / 86_400_000)
    if (days <= 14)  return 'day'
    if (days <= 90)  return 'week'
    return 'month'
  }, [mode, customRange])

  const canNavigateNext = useMemo(() => {
    if (mode === 'custom') return false
    const today = new Date()
    if (mode === 'month') return !isSameMonth(anchor, today) && !isAfter(anchor, today)
    return !isSameWeek(anchor, today, WEEK_OPTS)
  }, [mode, anchor])

  const navigatePrev = useCallback(() => {
    if (mode === 'custom') return
    setAnchor(a => mode === 'month' ? subMonths(a, 1) : subWeeks(a, 1))
  }, [mode])

  const navigateNext = useCallback(() => {
    if (!canNavigateNext) return
    setAnchor(a => mode === 'month' ? addMonths(a, 1) : addWeeks(a, 1))
  }, [mode, canNavigateNext])

  const setMode = useCallback((m: PeriodMode) => {
    setModeState(m)
    if (m !== 'custom') setAnchor(new Date())
  }, [])

  return (
    <PeriodContext.Provider value={{
      mode, setMode, anchor, groupBy, range, prevRange,
      navigatePrev, navigateNext, canNavigateNext,
      customRange, setCustomRange,
    }}>
      {children}
    </PeriodContext.Provider>
  )
}

export function useDateRange() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}
