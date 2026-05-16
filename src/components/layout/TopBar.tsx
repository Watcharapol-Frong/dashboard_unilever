'use client'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useDateRange } from '@/context/DateRangeContext'
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

// Thai month names
const MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const MONTHS_FULL  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

const WEEK_OPTS = { weekStartsOn: 0 } as const

function getPeriodLabel(mode: 'month' | 'week', anchor: Date): string {
  if (mode === 'month') {
    return `${MONTHS_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`
  }
  const sun = startOfWeek(anchor, WEEK_OPTS)
  const sat = endOfWeek(anchor, WEEK_OPTS)
  const sameMonth = sun.getMonth() === sat.getMonth()
  if (sameMonth) {
    return `${sun.getDate()}–${sat.getDate()} ${MONTHS_SHORT[sat.getMonth()]} ${sat.getFullYear()}`
  }
  return `${sun.getDate()} ${MONTHS_SHORT[sun.getMonth()]} – ${sat.getDate()} ${MONTHS_SHORT[sat.getMonth()]} ${sat.getFullYear()}`
}

export function TopBar({ title }: { title?: string }) {
  const { mode, setMode, anchor, navigatePrev, navigateNext, canNavigateNext } = useDateRange()
  const pathname = usePathname()
  const hideControls = HIDE_CONTROLS_PATHS.some(p => pathname.startsWith(p))
  const pageLabel = title ?? getPageLabel(pathname)

  return (
    <header className="no-print sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
      {/* Left — sidebar trigger + breadcrumb */}
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

      {/* Right — period selector + print */}
      {!hideControls && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* Mode tabs */}
            <div className="flex items-center border rounded-lg overflow-hidden text-sm">
              {(['month', 'week'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    mode === m
                      ? 'bg-[#003DA6] text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {m === 'month' ? 'Month' : 'Week'}
                </button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={navigatePrev}
                className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted transition-colors"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="min-w-[160px] text-center text-sm font-medium tabular-nums">
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
