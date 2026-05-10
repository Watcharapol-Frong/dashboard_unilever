'use client'
import { ResponsiveBar } from '@nivo/bar'

interface NivoBarProps {
  data: Record<string, string | number>[]
  keys: string[]
  indexBy: string
  height?: number
  layout?: 'vertical' | 'horizontal'
  groupMode?: 'grouped' | 'stacked'
  colors?: string[]
  legend?: boolean
  valueFormat?: (v: number) => string
  tickRotation?: number
}

const BRAND_COLORS = ['#003DA6', '#EE2737', '#F5A623', '#10b981', '#8b5cf6', '#06b6d4', '#f97316']

export function NivoBar({ data, keys, indexBy, height = 300, layout = 'vertical', groupMode = 'grouped', colors, legend = true, valueFormat, tickRotation = -30 }: NivoBarProps) {
  return (
    <div style={{ height }}>
      <ResponsiveBar
        data={data}
        keys={keys}
        indexBy={indexBy}
        layout={layout}
        colors={colors ?? BRAND_COLORS}
        margin={{ top: 20, right: legend ? 120 : 20, bottom: layout === 'horizontal' ? 40 : 60, left: layout === 'horizontal' ? 140 : 60 }}
        padding={0.3}
        groupMode={groupMode}
        valueScale={{ type: 'linear' }}
        indexScale={{ type: 'band', round: true }}
        axisBottom={layout === 'vertical'
          ? { tickRotation, tickSize: 5, legendOffset: 50, legend: '' }
          : { legend: '', legendOffset: 36, format: valueFormat ? (v: number) => valueFormat(v) : undefined, tickValues: 4, tickRotation: 0 }}
        axisLeft={layout === 'vertical' ? { tickSize: 5, format: valueFormat ? (v: number) => valueFormat(v) : undefined } : null}
        axisRight={null}
        axisTop={null}
        labelSkipWidth={16}
        labelSkipHeight={16}
        enableLabel={false}
        legends={legend ? [{
          dataFrom: 'keys',
          anchor: 'bottom-right',
          direction: 'column',
          justify: false,
          translateX: 120,
          translateY: 0,
          itemsSpacing: 2,
          itemWidth: 100,
          itemHeight: 20,
          itemDirection: 'left-to-right',
          symbolSize: 12,
          symbolShape: 'circle',
        }] : []}
        animate
        theme={{ axis: { ticks: { text: { fontSize: 11 } }, legend: { text: { fontSize: 12 } } } }}
      />
    </div>
  )
}
