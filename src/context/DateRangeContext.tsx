'use client'
import { createContext, useContext, useState, useMemo } from 'react'
import { startOfMonth, startOfWeek, subWeeks } from 'date-fns'
import type { DateRange } from '@/types'

export type FilterMode = 'month' | 'week' | 'custom'

interface DateRangeContextValue {
  range: DateRange
  prevRange: DateRange
  mode: FilterMode
  setMode: (mode: FilterMode) => void
  customRange: DateRange
  setCustomRange: (r: DateRange) => void
}

const DEFAULT_CUSTOM_FROM = new Date(2026, 1, 1) // Feb 1, 2026

function computeRanges(mode: FilterMode, custom: DateRange): { range: DateRange; prevRange: DateRange } {
  const now = new Date()
  if (mode === 'month') {
    const from = startOfMonth(now)
    const to = now
    const prevMonthDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    const prevFrom = startOfMonth(prevMonthDay)
    return { range: { from, to }, prevRange: { from: prevFrom, to: prevMonthDay } }
  }
  if (mode === 'week') {
    const from = startOfWeek(now, { weekStartsOn: 1 })
    const to = now
    const lastWeekSameDay = subWeeks(now, 1)
    const prevFrom = startOfWeek(lastWeekSameDay, { weekStartsOn: 1 })
    return { range: { from, to }, prevRange: { from: prevFrom, to: lastWeekSameDay } }
  }
  const duration = custom.to.getTime() - custom.from.getTime()
  const prevTo = new Date(custom.from.getTime() - 86400000)
  const prevFrom = new Date(prevTo.getTime() - duration)
  return { range: custom, prevRange: { from: prevFrom, to: prevTo } }
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null)

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<FilterMode>('month')
  const [customRange, setCustomRange] = useState<DateRange>({
    from: DEFAULT_CUSTOM_FROM,
    to: new Date(),
  })

  const { range, prevRange } = useMemo(() => computeRanges(mode, customRange), [mode, customRange])

  return (
    <DateRangeContext.Provider value={{ range, prevRange, mode, setMode, customRange, setCustomRange }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}
