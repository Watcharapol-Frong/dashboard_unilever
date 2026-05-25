'use client'

import { useMemo } from 'react'
import { ResponsiveSankey } from '@nivo/sankey'
import { useDashboardSWR } from '@/hooks/useDashboardSWR'
import { formatNumber, formatPct } from '@/lib/formatters'

// ─── Funnel Node Colors ───────────────────────────────────────────────────────
const NODE_COLORS: Record<string, string> = {
  'All Leads':       '#003DA6',  // Unilever Navy
  'Contacted':       '#1a5fd4',  // Bright Blue
  'Not Contacted':   '#94a3b8',  // Muted Slate
  'Engaged':         '#10b981',  // Emerald
  'Not Engaged':     '#f59e0b',  // Amber — same level as Engaged
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
  engaged: number
  notEngaged: number
  totalConverted: number
  totalNotConverted: number
  newConverted: number
  repeatConverted: number
  convFromEngaged: number
  convFromNotEngaged: number
  contactRate: number
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

interface TelesalesFunnelChartProps {
  startDate: string
  endDate: string
  channel: string
  cmg: string
  agent: string
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TelesalesFunnelChart({
  startDate,
  endDate,
  channel,
  cmg,
  agent,
}: TelesalesFunnelChartProps) {
  const apiUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (startDate) p.set('startDate', startDate)
    if (endDate)   p.set('endDate',   endDate)
    if (channel && channel !== 'all') p.set('channel', channel)
    if (cmg && cmg !== 'all')         p.set('cmg', cmg)
    if (agent && agent !== 'all')     p.set('agent', agent)
    return `/api/data/telesales/funnel?${p.toString()}`
  }, [startDate, endDate, channel, cmg, agent])

  const { data, isLoading } = useDashboardSWR<FunnelData>(apiUrl)

  const sankeyData = useMemo(() => {
    if (!data) return null
    return {
      nodes: data.nodes.map((n) => ({ id: n.name })),
      links: data.links.map((l) => ({
        source: data.nodes[l.source].name,
        target: data.nodes[l.target].name,
        value: l.value,
      })),
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
      <div className="h-[420px] w-full">
        {sankeyData && (
          <ResponsiveSankey
            data={sankeyData}
            margin={{ top: 20, right: 180, bottom: 20, left: 180 }}
            align="start"
            colors={(node) => getNodeColor(node.id as string)}
            nodeOpacity={1}
            nodeHoverOthersOpacity={0.35}
            nodeThickness={18}
            nodeSpacing={28}
            nodeBorderWidth={0}
            nodeBorderRadius={4}
            linkOpacity={0.4}
            linkHoverOthersOpacity={0.1}
            linkContract={3}
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            label={(node) => `${node.id} (${formatNumber(node.value)})`}
            labelPadding={18}
            theme={{
              labels: {
                text: {
                  fontSize: 11,
                  fill: 'hsl(var(--foreground))',
                  fontWeight: 500,
                }
              },
              tooltip: {
                container: {
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                  fontSize: 11,
                  borderRadius: 4,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  border: '1px solid hsl(var(--border))',
                  padding: '8px 12px',
                }
              }
            }}
          />
        )}
      </div>

      {/* ── Stage Labels ── */}
      <div className="flex justify-between px-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        <span>All Leads</span>
        <span>Contacted</span>
        <span>Engaged / Not Engaged</span>
        <span>Converted</span>
        <span>Customer Type</span>
      </div>
    </div>
  )
}
