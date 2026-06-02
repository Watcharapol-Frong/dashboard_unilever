'use client'

import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useMonthRange, lastDayOfMonth } from '@/hooks/useMonthRange'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Badge } from '@/components/ui/badge'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallRecord {
  mmid: string
  mobile: string | null
  lead_customers: string | null
  agent: string | null
  call_status: string | null
  first_connected_date: string | null
}

interface TelesalesData {
  calls: CallRecord[]
  months: string[]
  options: { agents: string[] }
}

// ── Call status options (Thai DB values) ──────────────────────────────────────

const CALL_STATUS_OPTIONS = [
  'สั่งซื้อสินค้าเรียบร้อย',
  'สั่งสินค้าอื่นๆ',
  'เสนอราคาแล้ว อยู่ระหว่างรอการยืนยันคำสั่งซื้อ',
  'นัดหมายติดต่อกลับ',
  'ไม่สะดวกคุย',
  'ไม่รับสาย 1',
  'ไม่รับสาย 2',
  'ไม่รับสาย 3',
  'ไม่รับสาย',
  'ไม่รับสาย/สายว่างแต่ไม่รับ',
  'ยังไม่ต้องการสินค้า',
  'ปิดเครื่อง/ติดต่อไม่ได้',
  'สายไม่ว่าง',
  'เบอร์ผิด/ไม่มีสัญญาน',
  'สายว่างไม่มีคนรับ',
  'เบอร์บ้านไม่มีคนรับ',
]

// ── Column definitions ────────────────────────────────────────────────────────

const callLogColumns: ColumnDef<CallRecord>[] = [
  {
    accessorKey: 'first_connected_date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Call Date" />,
    cell: ({ row }) => row.original.first_connected_date
      ? new Date(row.original.first_connected_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'mmid',
    header: 'MMID',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.mmid}</span>,
  },
  {
    accessorKey: 'mobile',
    header: 'Mobile',
    cell: ({ row }) => row.original.mobile ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'lead_customers',
    header: 'Tier',
    cell: ({ row }) => row.original.lead_customers ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'agent',
    header: 'Agent',
    cell: ({ row }) => row.original.agent ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'call_status',
    header: 'Call Status',
    cell: ({ row }) => {
      const raw = row.original.call_status
      if (!raw) return <span className="text-muted-foreground">—</span>
      const isOrder    = raw === 'สั่งซื้อสินค้าเรียบร้อย' || raw === 'สั่งสินค้าอื่นๆ'
      const isNoAnswer = raw.startsWith('ไม่รับสาย') || raw === 'ปิดเครื่อง/ติดต่อไม่ได้'
      return (
        <Badge
          variant={isOrder ? 'default' : isNoAnswer ? 'secondary' : 'outline'}
          className="text-xs whitespace-nowrap"
        >
          {raw}
        </Badge>
      )
    },
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function CallLogClient() {
  const {
    rangeFrom, rangeTo, hoverMonth, setHoverMonth,
    handleChipClick: baseHandleChipClick, clearRange,
  } = useMonthRange()

  // Default to 'custom' so date params are always sent → no LIMIT 500 on first load
  const [interval,    setInterval]    = useState<'custom' | 'monthly'>('custom')
  const [customStart, setCustomStart] = useState('2026-05-01')
  const [customEnd,   setCustomEnd]   = useState('2026-05-31')
  const [channel,     setChannel]     = useState<string[]>([])
  const [agent,       setAgent]       = useState<string[]>([])
  const [callStatus,  setCallStatus]  = useState<string[]>([])
  const [callSearch,          setCallSearch]          = useState('')
  const [debouncedCallSearch, setDebouncedCallSearch] = useState('')
  const callSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCallSearch = (v: string) => {
    setCallSearch(v)
    if (callSearchRef.current) clearTimeout(callSearchRef.current)
    callSearchRef.current = setTimeout(() => setDebouncedCallSearch(v), 300)
  }

  const handleChipClick = (m: string) => {
    if (interval === 'custom') setInterval('monthly')
    baseHandleChipClick(m)
  }

  const durationDays = useMemo(() => {
    if (interval !== 'custom' || !customStart || !customEnd) return 0
    return Math.ceil(Math.abs(new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000)
  }, [interval, customStart, customEnd])

  const effectiveStart = rangeFrom ?? (interval === 'custom' ? customStart : null)
  const effectiveEnd   = rangeFrom
    ? lastDayOfMonth(rangeTo ?? rangeFrom)
    : (interval === 'custom' ? customEnd : null)

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (effectiveStart)         p.set('startDate',   effectiveStart)
    if (effectiveEnd)           p.set('endDate',     effectiveEnd)
    if (channel.length > 0)     p.set('channel',     channel.join(','))
    if (agent.length > 0)       p.set('agent',       agent.join(','))
    if (callStatus.length > 0)  p.set('callStatus',  callStatus.join(','))
    if (debouncedCallSearch)    p.set('search',      debouncedCallSearch)
    return `/api/data/telesales?${p.toString()}`
  }, [effectiveStart, effectiveEnd, channel, agent, callStatus, debouncedCallSearch])

  const { data, isLoading } = useDashboardSWR<TelesalesData>(apiUrl)

  if (isLoading && !data) return <PageLoading cols={1} />
  if (!data || data.months.length === 0) {
    return <PageEmpty message="No call log data available" hint="Please upload telesales data and build mart." />
  }

  const { calls, options, months } = data
  const hasFilter = channel.length > 0 || agent.length > 0 || callStatus.length > 0
  const hasRange  = !!(rangeFrom || interval === 'custom')

  const displayRangeLabel = (() => {
    if (rangeFrom) {
      const from = new Date(rangeFrom).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      if (!rangeTo) return from
      return `${from} – ${new Date(rangeTo).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
    }
    if (interval === 'custom') return `${customStart} – ${customEnd}`
    return null
  })()

  return (
    <div className="space-y-6">

      {/* ── Filter & Range Selection ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#003DA6]" />
            <CardTitle className="text-sm font-medium">Filter &amp; Range Selection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Row 1: month chips + date picker */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5 flex-wrap">
                {months.map(m => {
                  const effectiveTo = rangeTo ?? (rangeFrom ? hoverMonth : null)
                  const active   = m === rangeFrom || m === rangeTo
                  const inRange  = !!(rangeFrom && effectiveTo && m > rangeFrom && m < effectiveTo)
                  const preview  = !!(!rangeTo && rangeFrom && hoverMonth && m > rangeFrom && m <= hoverMonth)
                  return (
                    <button
                      key={m}
                      onClick={() => handleChipClick(m)}
                      onMouseEnter={() => setHoverMonth(m)}
                      onMouseLeave={() => setHoverMonth(null)}
                      className={[
                        'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all select-none border',
                        active
                          ? 'bg-[#003DA6] text-white border-[#003DA6] shadow-sm'
                          : inRange || preview
                          ? 'bg-[#003DA6]/10 text-[#003DA6] border-[#003DA6]/20'
                          : 'bg-background text-muted-foreground border-gray-200 hover:bg-gray-50 hover:text-foreground',
                      ].join(' ')}
                    >
                      {new Date(m).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-2">
                <DateRangePicker
                  from={interval === 'custom' ? customStart : ''}
                  to={interval === 'custom' ? customEnd : ''}
                  onFromChange={start => { setCustomStart(start); clearRange(); setInterval('custom') }}
                  onToChange={end   => { setCustomEnd(end);   clearRange(); setInterval('custom') }}
                />
                {interval === 'custom' && durationDays > 0 && (
                  <span className="text-[9px] bg-blue-50 text-[#003DA6] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                    {durationDays}d
                  </span>
                )}
              </div>
            </div>

            {/* Row 2: dropdown filters */}
            <div className="flex flex-wrap items-center gap-4">
              <MultiSelect
                label="All Channels"
                value={channel}
                onChange={setChannel}
                options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]}
                width="w-[130px]"
              />
              <MultiSelect
                label="All Agents"
                value={agent}
                onChange={setAgent}
                options={(options.agents ?? []).map(v => ({ value: v, label: v }))}
                width="w-[150px]"
              />
              <MultiSelect
                label="All Statuses"
                value={callStatus}
                onChange={setCallStatus}
                options={CALL_STATUS_OPTIONS.map(v => ({ value: v, label: v }))}
                width="w-[160px]"
              />
              {(hasFilter || hasRange) && (
                <button
                  onClick={() => {
                    setChannel([]); setAgent([]); setCallStatus([])
                    clearRange(); setInterval('custom')
                    setCustomStart('2026-05-01'); setCustomEnd('2026-05-31')
                  }}
                  className="text-xs text-[#003DA6] hover:underline font-semibold"
                >
                  Reset All
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            {displayRangeLabel
              ? <>Showing: <span className="font-medium text-foreground">{displayRangeLabel}</span></>
              : <>Showing: <span className="font-medium text-foreground">all available periods</span></>
            }
          </p>
        </CardContent>
      </Card>

      {/* ── Call Log Table ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Call Log
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {(calls?.length ?? 0).toLocaleString()} records · search by MMID or mobile
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={callLogColumns}
            data={calls ?? []}
            searchValue={callSearch}
            onSearchChange={handleCallSearch}
            searchPlaceholder="Search MMID or mobile..."
          />
        </CardContent>
      </Card>
    </div>
  )
}
