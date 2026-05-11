'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { format } from 'date-fns'
import { PrinterIcon, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDateRange, type FilterMode } from '@/context/DateRangeContext'
import { useSidebar } from '@/context/SidebarContext'

const HIDE_CONTROLS_PATHS = ['/upload', '/settings']

const TABS: { mode: FilterMode; label: string }[] = [
  { mode: 'month', label: 'Month' },
  { mode: 'week', label: 'Week' },
  { mode: 'custom', label: 'Custom' },
]

export function TopBar({ title }: { title?: string }) {
  const { mode, setMode, range, customRange, setCustomRange } = useDateRange()
  const { toggle } = useSidebar()
  const pathname = usePathname()
  const hideControls = HIDE_CONTROLS_PATHS.some(p => pathname.startsWith(p))
  const [showCustom, setShowCustom] = useState(false)
  const [tempFrom, setTempFrom] = useState(format(customRange.from, 'yyyy-MM-dd'))
  const [tempTo, setTempTo] = useState(format(customRange.to, 'yyyy-MM-dd'))

  function handleModeChange(m: FilterMode) {
    setMode(m)
    if (m === 'custom') setShowCustom(true)
    else setShowCustom(false)
  }

  function applyCustom() {
    const from = new Date(tempFrom)
    const to = new Date(tempTo)
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
      setCustomRange({ from, to })
    }
    setShowCustom(false)
  }

  return (
    <header className="no-print sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
          <Menu className="h-4 w-4" />
        </Button>
        {title && <h1 className="text-xl font-bold">{title}</h1>}
      </div>

      {!hideControls && (
        <div className="flex items-center gap-3">
          {/* Mode Tabs + date display */}
          <div className="relative">
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center border rounded-lg overflow-hidden">
                {TABS.map(({ mode: m, label }) => (
                  <button
                    key={m}
                    onClick={() => handleModeChange(m)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      mode === m
                        ? 'bg-[#003DA6] text-white'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {format(range.from, 'dd MMM yyyy')} – {format(range.to, 'dd MMM yyyy')}
              </span>
            </div>

            {/* Custom date picker popup */}
            {showCustom && (
              <div className="absolute right-0 top-full mt-2 bg-white border rounded-lg shadow-lg p-4 z-50 space-y-3 w-72">
                <p className="text-sm font-medium">Custom Date Range</p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Start</label>
                  <input
                    type="date"
                    value={tempFrom}
                    onChange={e => setTempFrom(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">End</label>
                  <input
                    type="date"
                    value={tempTo}
                    onChange={e => setTempTo(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyCustom} className="flex-1">Apply</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowCustom(false)} className="flex-1">Cancel</Button>
                </div>
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
            <PrinterIcon className="h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      )}
    </header>
  )
}
