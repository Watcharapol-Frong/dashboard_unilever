'use client'
import { ResponsiveSankey } from '@nivo/sankey'

interface SankeyFunnelProps {
  nodes: { id: string }[]
  links: { source: string; target: string; value: number }[]
  height?: number
}

const NODE_COLORS: Record<string, string> = {
  'Lead List': '#003DA6',
  'Called': '#1a5fd4',
  'Contacted': '#F5A623',
  'No Answer': '#94a3b8',
  'Interested': '#10b981',
  'Not Interested': '#EE2737',
  'Ordered': '#059669',
  'First Purchase': '#047857',
  'Repeat Order': '#6d28d9',
}

export function SankeyFunnel({ nodes, links, height = 450 }: SankeyFunnelProps) {
  if (!nodes.length || !links.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted-foreground text-sm">
        No funnel data available for this period
      </div>
    )
  }

  return (
    <div style={{ height }}>
      <ResponsiveSankey
        data={{ nodes, links }}
        margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
        align="justify"
        colors={(node) => NODE_COLORS[node.id as string] ?? '#64748b'}
        nodeOpacity={1}
        nodeHoverOthersOpacity={0.35}
        nodeThickness={18}
        nodeSpacing={24}
        nodeBorderWidth={0}
        nodeBorderRadius={3}
        linkOpacity={0.5}
        linkHoverOthersOpacity={0.1}
        linkContract={3}
        enableLinkGradient
        labelPosition="outside"
        labelOrientation="horizontal"
        label={(node) => `${node.id} (${node.value.toLocaleString()})`}
        labelPadding={16}
        theme={{ labels: { text: { fontSize: 12 } } }}
      />
    </div>
  )
}
