'use client'

import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/dashboard/MultiSelect'
import { DataTable } from '@/components/ui/data-table'
import { PageLoading, PageEmpty } from '@/components/dashboard/PageState'
import { DateRangePicker } from '@/components/dashboard/DateRangePicker'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { useMonthRange, lastDayOfMonth } from '@/hooks/useMonthRange'
import { MonthChipGroup } from '@/components/dashboard/MonthChipGroup'
import { columns } from '../../columns'
import { Calendar } from 'lucide-react'

interface SalesData {
  recent_orders: any[]
  options: { cmg: string[]; agents: string[] }
  months: string[]
}

type Interval   = 'monthly' | 'custom'
type Conversion = 'all' | 'converted' | 'not_converted'

export default function OrdersClient() {
  const {
    rangeFrom, rangeTo, hoverMonth, setHoverMonth,
    handleChipClick: baseHandleChipClick, clearRange,
  } = useMonthRange()

  const [interval,        setInterval]        = useState<Interval>('custom')
  const [customStart,     setCustomStart]     = useState('2026-05-01')
  const [customEnd,       setCustomEnd]       = useState('2026-05-31')
  const [channel,         setChannel]         = useState<string[]>([])
  const [cmg,             setCmg]             = useState<string[]>([])
  const [agent,           setAgent]           = useState<string[]>([])
  const [filterConv,      setFilterConv]      = useState<Conversion>('all')
  const [orderSearch,     setOrderSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleOrderSearch = (v: string) => {
    setOrderSearch(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300)
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
    const p = new URLSearchParams({ interval: 'daily' })
    if (channel.length > 0)   p.set('channel',    channel.join(','))
    if (cmg.length > 0)       p.set('cmg',        cmg.join(','))
    if (agent.length > 0)     p.set('agent',      agent.join(','))
    if (filterConv !== 'all') p.set('filterConv', filterConv)
    if (effectiveStart)       p.set('startDate',  effectiveStart)
    if (effectiveEnd)         p.set('endDate',    effectiveEnd)
    if (debouncedSearch)      p.set('search',     debouncedSearch)
    return `/api/data/sales?${p.toString()}`
  }, [channel, cmg, agent, filterConv, effectiveStart, effectiveEnd, debouncedSearch])

  const { data, isLoading } = useDashboardSWR<SalesData>(apiUrl)

  if (isLoading && !data) return <PageLoading cols={1} />
  if (!data || data.months.length === 0) {
    return <PageEmpty message="No orders available" hint="Please build mart first." />
  }

  const { recent_orders, options, months } = data
  const hasFilter = channel.length > 0 || cmg.length > 0 || agent.length > 0 || filterConv !== 'all'
  const hasRange  = !!(rangeFrom || interval === 'custom')

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
            <div className="flex flex-wrap items-center gap-4">
              <MonthChipGroup
                months={months}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                hoverMonth={hoverMonth}
                onChipClick={handleChipClick}
                onMouseEnter={setHoverMonth}
                onMouseLeave={() => setHoverMonth(null)}
              />
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

            <div className="flex flex-wrap items-center gap-4">
              <MultiSelect
                label="All Channels"
                value={channel}
                onChange={setChannel}
                options={[{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]}
                width="w-[130px]"
              />
              <MultiSelect
                label="All Segments"
                value={cmg}
                onChange={setCmg}
                options={options.cmg.map(v => ({ value: v, label: v }))}
                width="w-[150px]"
              />
              <MultiSelect
                label="All Agents"
                value={agent}
                onChange={setAgent}
                options={options.agents.map(v => ({ value: v, label: v }))}
                width="w-[150px]"
              />
              <Select value={filterConv} onValueChange={v => setFilterConv(v as Conversion)}>
                <SelectTrigger className="h-7 text-xs w-[155px]">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="converted">Converted Only</SelectItem>
                  <SelectItem value="not_converted">Not Converted</SelectItem>
                </SelectContent>
              </Select>

              {(hasFilter || hasRange) && (
                <button
                  onClick={() => {
                    setChannel([]); setCmg([]); setAgent([]); setFilterConv('all')
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
        </CardContent>
      </Card>

      {/* ── Orders Table ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Telesales Orders
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {(recent_orders?.length ?? 0).toLocaleString()} records
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={recent_orders ?? []}
            searchValue={orderSearch}
            onSearchChange={handleOrderSearch}
            searchPlaceholder="Search MMID or Order No..."
          />
        </CardContent>
      </Card>
    </div>
  )
}
