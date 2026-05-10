'use client'
import { ResponsivePie } from '@nivo/pie'

interface NivoPieProps {
  data: { id: string; label: string; value: number }[]
  height?: number
  innerRadius?: number
  legend?: boolean
}

const BRAND_COLORS = ['#003DA6', '#EE2737', '#F5A623', '#10b981', '#8b5cf6', '#06b6d4', '#f97316']

export function NivoPie({ data, height = 300, innerRadius = 0.5, legend = true }: NivoPieProps) {
  return (
    <div style={{ height }}>
      <ResponsivePie
        data={data}
        colors={BRAND_COLORS}
        margin={{ top: 20, right: legend ? 120 : 20, bottom: 20, left: 20 }}
        innerRadius={innerRadius}
        padAngle={0.7}
        cornerRadius={3}
        activeOuterRadiusOffset={8}
        borderWidth={1}
        borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
        enableArcLinkLabels={!legend}
        arcLinkLabelsSkipAngle={10}
        arcLabelsSkipAngle={10}
        legends={legend ? [{
          anchor: 'right',
          direction: 'column',
          justify: false,
          translateX: 120,
          translateY: 0,
          itemsSpacing: 4,
          itemWidth: 110,
          itemHeight: 18,
          itemTextColor: '#666',
          itemDirection: 'left-to-right',
          symbolSize: 12,
          symbolShape: 'circle',
        }] : []}
        theme={{ axis: { ticks: { text: { fontSize: 11 } } } }}
      />
    </div>
  )
}
