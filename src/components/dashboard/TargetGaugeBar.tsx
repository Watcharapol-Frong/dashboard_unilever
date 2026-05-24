'use client'
import { Progress } from '@/components/ui/progress'
import { formatTHB, formatNumber } from '@/lib/formatters'
import { getProgressColor, cn } from '@/lib/utils'

interface TargetGaugeBarProps {
  label: string
  actual: number
  target: number
  format?: 'thb' | 'count' | 'pct'
  className?: string
}

export function TargetGaugeBar({ label, actual, target, format = 'thb', className }: TargetGaugeBarProps) {
  const pct = target > 0 ? actual / target : 0
  const displayActual = format === 'thb' ? formatTHB(actual) : format === 'pct' ? `${(actual * 100).toFixed(1)}%` : formatNumber(actual)
  const displayTarget = format === 'thb' ? formatTHB(target) : format === 'pct' ? `${(target * 100).toFixed(1)}%` : formatNumber(target)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {displayActual} / {displayTarget}
        </span>
      </div>
      <Progress
        value={Math.min(pct * 100, 100)}
        indicatorClassName={getProgressColor(pct)}
        className="h-3"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Achievement</span>
        <span className={cn('font-semibold', pct >= 0.9 ? 'text-green-600' : pct >= 0.7 ? 'text-amber-500' : 'text-red-500')}>
          {(pct * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
