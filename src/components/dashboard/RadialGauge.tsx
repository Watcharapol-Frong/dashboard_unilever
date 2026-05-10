'use client'
import { ResponsivePie } from '@nivo/pie'
import { formatTHB } from '@/lib/utils'

interface RadialGaugeProps {
  online: number
  offline: number
  target: number
  height?: number
}

export function RadialGauge({ online, offline, target, height = 220 }: RadialGaugeProps) {
  const total = online + offline
  const pct = target > 0 ? Math.min(total / target, 1) : 0
  const remaining = target > 0 ? Math.max(0, target - total) : 1

  const data = [
    { id: 'Online', label: 'Online', value: Math.max(online, 0) },
    { id: 'Offline', label: 'Offline', value: Math.max(offline, 0) },
    { id: 'Remaining', label: 'Remaining', value: remaining },
  ].filter(d => d.value > 0)

  return (
    <div style={{ height, position: 'relative' }}>
      <ResponsivePie
        data={data}
        colors={['#003DA6', '#EE2737', '#e5e7eb']}
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        innerRadius={0.72}
        padAngle={1.5}
        cornerRadius={3}
        enableArcLinkLabels={false}
        enableArcLabels={false}
        isInteractive
        legends={[]}
        tooltip={({ datum }) =>
          datum.id !== 'Remaining' ? (
            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            }}>
              {datum.label}: {formatTHB(datum.value as number)}
            </div>
          ) : <></>
        }
      />
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>
          {(pct * 100).toFixed(1)}%
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Achievement</div>
      </div>
    </div>
  )
}
