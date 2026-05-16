'use client'
import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, PrinterIcon, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useDateRange, type PeriodMode } from '@/context/DateRangeContext'
import { startOfWeek, endOfWeek } from 'date-fns'

const HIDE_CONTROLS_PATHS = ['/upload', '/leads']

const PAGE_LABELS: Record<string, string> = {
  '/overview':   'Overview',
  '/telesales':  'Telesales',
  '/sales':      'Sales',
  '/products':   'Products',
  '/leads':      'Leads',
  '/incentives': 'Incentives',
  '/upload':     'Upload Data',
}

function getPageLabel(pathname: string) {
  for (const [path, label] of Object.entries(PAGE_LABELS)) {
    if (pathname === path || pathname.startsWith(path + '/')) return label
  }
  return 'Dashboard'
}

const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const MONTHS_FULL  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const WEEK_OPTS    = { weekStartsOn: 0 } as const

function getPeriodLabel(mode: PeriodMode, anchor: Date): string {
  if (mode === 'month') {
    return `${MONTHS_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`
  }
  const sun = startOfWeek(anchor, WEEK_OPTS)
  const sat = endOfWeek(anchor, WEEK_OPTS)
  if (sun.getMonth() === sat.getMonth()) {
    return `${sun.getDate()}–${sat.getDate()} ${MONTHS_SHORT[sat.getMonth()]} ${sat.getFullYear()}`
  }
  return `${sun.getDate()} ${MONTHS_SHORT[sun.getMonth()]} – ${sat.getDate()} ${MONTHS_SHORT[sat.getMonth()]} ${sat.getFullYear()}`
}

const MODES: { mode: PeriodMode; label: string }[] = [
  { mode: 'month',  label: 'Month'  },
  { mode: 'week',   label: 'Week'   },
  { mode: 'custom', label: 'Custom' },
]

export function TopBar({ title }: { title?: string }) {
  const {
    mode, setMode, anchor,
    navigatePrev, navigateNext, canNavigateNext,
    customRange, setCustomRange,
  } = useDateRange()

  const pathname    = usePathname()
  const hideControls = HIDE_CONTROLS_PATHS.some(p => pathname.startsWith(p))
  const pageLabel   = title ?? getPageLabel(pathname)

  // custom date picker popover state
  const [showPicker, setShowPicker] = useState(false)
  const [tempFrom, setTempFrom] = useState(format(customRange.from, 'yyyy-MM-dd'))
  const [tempTo,   setTempTo]   = useState(format(customRange.to,   'yyyy-MM-dd'))
  const pickerRef = useRef<HTMLDivElement>(null)

  // close picker when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  function handleModeClick(m: PeriodMode) {
    setMode(m)
    if (m === 'custom') {
      setTempFrom(format(customRange.from, 'yyyy-MM-dd'))
      setTempTo(format(customRange.to,     'yyyy-MM-dd'))
      setShowPicker(true)
    } else {
      setShowPicker(false)
    }
  }

  function applyCustom() {
    const from = new Date(tempFrom)
    const to   = new Date(tempTo)
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
      setCustomRange({ from, to })
    }
    setShowPicker(false)
  }

  // custom label shows the selected range
  const customLabel = `${format(customRange.from, 'dd MMM yy')} – ${format(customRange.to, 'dd MMM yy')}`

  return (
    <header className="no-print sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
      {/* Left */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className="h-8 w-8" />
        <Separator orientation="vertical" className="h-5" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right */}
      {!hideControls && (
        <div className="flex items-center gap-3">

          {/* Mode tabs */}
          <div className="flex items-center border rounded-lg overflow-hidden text-sm">
            {MODES.map(({ mode: m, label }) => (
              <button
                key={m}
                onClick={() => handleModeClick(m)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? 'bg-[#003DA6] text-white'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Navigation / Custom picker trigger */}
          <div className="relative" ref={pickerRef}>
            {mode === 'custom' ? (
              /* Custom: show range label as button → opens picker */
              <button
                onClick={() => setShowPicker(v => !v)}
                className="flex items-center gap-2 px-3 py-1.5 h-8 border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                {customLabel}
              </button>
            ) : (
              /* Month / Week: ◀ label ▶ */
              <div className="flex items-center gap-1">
                <button
                  onClick={navigatePrev}
                  className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted transition-colors"
                  aria-label="Previous period"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[160px] text-center text-sm font-medium">
                  {getPeriodLabel(mode, anchor)}
                </span>
                <button
                  onClick={navigateNext}
                  disabled={!canNavigateNext}
                  className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next period"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Custom date picker popover */}
            {showPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white border rounded-xl shadow-lg p-4 z-50 w-72 space-y-3">
                <p className="text-sm font-semibold">เลือกช่วงเวลา</p>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">วันเริ่มต้น</label>
                  <input
                    type="date"
                    value={tempFrom}
                    max={tempTo}
                    onChange={e => setTempFrom(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA6]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">วันสิ้นสุด</label>
                  <input
                    type="date"
                    value={tempTo}
                    min={tempFrom}
                    onChange={e => setTempTo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003DA6]"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={applyCustom} className="flex-1 bg-[#003DA6] hover:bg-[#002d80]">
                    ยืนยัน
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowPicker(false)} className="flex-1">
                    ยกเลิก
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
            <PrinterIcon className="h-4 w-4" />
            Print
          </Button>
        </div>
      )}
    </header>
  )
}
