'use client'

import { useMemo } from 'react'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { formatNumber, formatPct } from '@/lib/formatters'
import { SankeyChart, SankeyNode, SankeyLink, SankeyTooltip } from '@bklitui/ui/charts'

// ─── Funnel Node Colors ───────────────────────────────────────────────────────
const NODE_COLORS: Record<string, string> = {
  'All Leads':       '#003DA6',  // Unilever Navy
  'Contacted':       '#1a5fd4',  // Bright Blue
  'Not Contacted':   '#94a3b8',  // Muted Slate
  'Answered':        '#0ea5e9',  // Sky Blue
  'No Answer':       '#cbd5e1',  // Light Slate
  'Engaged':         '#10b981',  // Emerald
  'Not Engaged':     '#d1d5db',  // Light Gray
  'Not Converted':   '#f87171',  // Soft Red
  'Converted':       '#059669',  // Dark Emerald
  'New Customer':    '#047857',  // Forest Green
  'Repeat Customer': '#6d28d9',  // Purple (retention)
}

function getNodeColor(name: string): string {
  return NODE_COLORS[name] ?? '#64748b'
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface FunnelSummary {
  leadsAll: number
  contacted: number
  notContacted: number
  reached: number
  notReached: number
  engaged: number
  notEngaged: number
  totalConverted: number
  newConverted: number
  repeatConverted: number
  contactRate: number
  reachRate: number
  engageRate: number
  conversionRate: number
}

interface FunnelData {
  nodes: { name: string; category: string }[]
  links: { source: number; target: number; value: number }[]
  summary: FunnelSummary
}

// ─── Funnel Metric Strip ──────────────────────────────────────────────────────
function MetricStrip({
  label,
  value,
  rate,
  color,
}: {
  label: string
  value: number
  rate?: number
  color: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[80px]">
      <div
        className="w-2.5 h-2.5 rounded-full"
        style={{ background: color }}
      />
      <span className="text-xs font-bold text-foreground tabular-nums">
        {formatNumber(value)}
      </span>
      {rate !== undefined && (
        <span className="text-[10px] text-muted-foreground font-medium">
          {formatPct(rate)}
        </span>
      )}
      <span className="text-[10px] text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TelesalesFunnelChart() {
  const { data, isLoading } = useDashboardSWR<FunnelData>('/api/data/telesales/funnel')

  const sankeyData = useMemo(() => {
    if (!data) return null
    return {
      nodes: data.nodes.map((n) => ({ name: n.name })),
      links: data.links,
    }
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin opacity-50" />
          Loading funnel data...
        </div>
      </div>
    )
  }

  if (!data || !sankeyData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No funnel data available. Upload telesales data and rebuild mart.
      </div>
    )
  }

  const s = data.summary

  return (
    <div className="space-y-5">
      {/* ── Metric Strip ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-2 pt-1">
        <MetricStrip
          color={NODE_COLORS['All Leads']}
          label="All Leads"
          value={s.leadsAll}
        />
        <div className="flex items-center gap-1 self-center">
          <div className="h-px w-6 bg-border" />
          <span className="text-[10px] text-muted-foreground font-medium">
            {formatPct(s.contactRate)}
          </span>
          <div className="h-px w-6 bg-border" />
        </div>
        <MetricStrip
          color={NODE_COLORS['Contacted']}
          label="Contacted"
          rate={s.contactRate}
          value={s.contacted}
        />
        <div className="flex items-center gap-1 self-center">
          <div className="h-px w-6 bg-border" />
          <span className="text-[10px] text-muted-foreground font-medium">
            {formatPct(s.reachRate)}
          </span>
          <div className="h-px w-6 bg-border" />
        </div>
        <MetricStrip
          color={NODE_COLORS['Answered']}
          label="Answered"
          rate={s.reachRate}
          value={s.reached}
        />
        <div className="flex items-center gap-1 self-center">
          <div className="h-px w-6 bg-border" />
          <span className="text-[10px] text-muted-foreground font-medium">
            {formatPct(s.engageRate)}
          </span>
          <div className="h-px w-6 bg-border" />
        </div>
        <MetricStrip
          color={NODE_COLORS['Engaged']}
          label="Engaged"
          rate={s.engageRate}
          value={s.engaged}
        />
        <div className="flex items-center gap-1 self-center">
          <div className="h-px w-6 bg-border" />
          <span className="text-[10px] text-muted-foreground font-medium">
            {formatPct(s.conversionRate)}
          </span>
          <div className="h-px w-6 bg-border" />
        </div>
        <MetricStrip
          color={NODE_COLORS['Converted']}
          label="Converted"
          rate={s.conversionRate}
          value={s.totalConverted}
        />
        <div className="flex items-center gap-2 self-center ml-auto">
          <MetricStrip
            color={NODE_COLORS['New Customer']}
            label="New"
            value={s.newConverted}
          />
          <MetricStrip
            color={NODE_COLORS['Repeat Customer']}
            label="Repeat"
            value={s.repeatConverted}
          />
        </div>
      </div>

      {/* ── Sankey Chart ── */}
      <SankeyChart
        animationDuration={900}
        aspectRatio="16 / 6"
        className="min-h-[320px]"
        data={sankeyData}
        margin={{ top: 16, right: 160, bottom: 16, left: 160 }}
        nodePadding={20}
        nodeWidth={14}
      >
        <SankeyNode
          getNodeColor={(node) => getNodeColor(node.name ?? '')}
          lineCap={4}
          showLabels
        />
        <SankeyLink
          fadedOpacity={0.08}
          strokeOpacity={0.45}
          useGradient
        />
        <SankeyTooltip
          formatValue={(v) => formatNumber(Math.round(v))}
        />
      </SankeyChart>

      {/* ── Stage Labels ── */}
      <div className="flex justify-between px-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        <span>All Leads</span>
        <span>Contacted</span>
        <span>Answered</span>
        <span>Engaged</span>
        <span>Converted</span>
        <span>Customer Type</span>
      </div>
    </div>
  )
}
