'use client'

import * as React from 'react'
import { CalendarIcon } from 'lucide-react'
import { addDays, format } from 'date-fns'
import type { DateRange } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface DateRangePickerProps {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  className?: string
}

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  const range: DateRange | undefined =
    from && to
      ? { from: new Date(from), to: new Date(to) }
      : from
      ? { from: new Date(from), to: undefined }
      : undefined

  const handleSelect = (r: DateRange | undefined) => {
    if (!r) return
    if (r.from) onFromChange(format(r.from, 'yyyy-MM-dd'))
    if (r.to) {
      onToChange(format(r.to, 'yyyy-MM-dd'))
      setOpen(false)
    } else {
      onToChange('')
    }
  }

  const label = React.useMemo(() => {
    if (range?.from && range?.to) {
      return `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`
    }
    if (range?.from) {
      return `${format(range.from, 'd MMM yyyy')} – Select end`
    }
    return 'Pick a date range'
  }, [range])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-7 justify-start gap-1.5 px-2 text-[11px] font-medium min-w-[200px]',
            !range && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={range?.from}
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-0">
          <button
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
            onClick={() => {
              const today = new Date()
              onFromChange(format(addDays(today, -29), 'yyyy-MM-dd'))
              onToChange(format(today, 'yyyy-MM-dd'))
              setOpen(false)
            }}
          >
            Last 30 days
          </button>
          <button
            className="text-[11px] text-muted-foreground hover:text-foreground underline"
            onClick={() => {
              const today = new Date()
              onFromChange(format(addDays(today, -89), 'yyyy-MM-dd'))
              onToChange(format(today, 'yyyy-MM-dd'))
              setOpen(false)
            }}
          >
            Last 90 days
          </button>
          <button
            className="text-[11px] text-[#003DA6] hover:underline font-semibold"
            onClick={() => {
              onFromChange('')
              onToChange('')
              setOpen(false)
            }}
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
