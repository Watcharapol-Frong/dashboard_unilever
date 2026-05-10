'use client'
import { ResponsiveLine } from '@nivo/line'

interface NivoLineProps {
  data: { id: string; color?: string; data: { x: string; y: number }[] }[]
  height?: number
  yFormat?: string
  curve?: 'linear' | 'monotoneX' | 'step'
  legend?: boolean
  enableArea?: boolean
}

const BRAND_COLORS = ['#003DA6', '#EE2737', '#F5A623', '#10b981']

export function NivoLine({ data, height = 300, yFormat, curve = 'monotoneX', legend = true, enableArea = false }: NivoLineProps) {
  return (
    <div style={{ height }}>
      <ResponsiveLine
        data={data}
        colors={BRAND_COLORS}
        margin={{ top: 20, right: legend ? 120 : 20, bottom: 60, left: 70 }}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
        yFormat={yFormat}
        curve={curve}
        axisBottom={{ tickRotation: -30, tickSize: 5 }}
        axisLeft={{ tickSize: 5 }}
        enablePoints
        pointSize={4}
        pointBorderWidth={2}
        pointBorderColor={{ from: 'serieColor' }}
        enableArea={enableArea}
        areaOpacity={0.1}
        useMesh
        enableSlices="x"
        legends={legend ? [{
          anchor: 'bottom-right',
          direction: 'column',
          justify: false,
          translateX: 120,
          translateY: 0,
          itemsSpacing: 4,
          itemDirection: 'left-to-right',
          itemWidth: 100,
          itemHeight: 20,
          symbolSize: 12,
          symbolShape: 'circle',
        }] : []}
        theme={{ axis: { ticks: { text: { fontSize: 11 } } } }}
      />
    </div>
  )
}
