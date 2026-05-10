import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'

interface KpiExtra {
  label: string
  value: string
}

interface KpiCardProps {
  title: string
  value: string
  comparison?: number       // ratio: 0.15 = +15%, -0.1 = -10%
  comparisonLabel?: string  // e.g. 'vs last month', 'vs last week'
  subtitle?: string         // simple secondary line below value
  icon?: LucideIcon
  targetPct?: number        // ignored visually, accepted for compat
  extras?: KpiExtra[]
  loading?: boolean
  className?: string
}

export function KpiCard({ title, value, comparison, comparisonLabel, subtitle, icon: Icon, extras, loading, className }: KpiCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="pt-4 pb-4">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-8 w-28 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    )
  }

  const hasComparison = comparison !== undefined && isFinite(comparison)
  const isUp = hasComparison && comparison > 0.001
  const isDown = hasComparison && comparison < -0.001

  return (
    <Card className={cn('hover:shadow-md transition-shadow', className)}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className="text-xs font-medium text-muted-foreground leading-tight">{title}</span>
          </div>
          {hasComparison && (
            <span className={cn(
              'flex items-center gap-0.5 text-xs font-semibold rounded-full px-1.5 py-0.5 shrink-0 ml-1',
              isDown ? 'bg-red-50 text-red-500' : isUp ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
            )}>
              {isDown ? <TrendingDown className="h-2.5 w-2.5" /> : isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
              {isUp ? '+' : ''}{(comparison * 100).toFixed(1)}%
            </span>
          )}
        </div>

        <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>

        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
        {comparisonLabel && hasComparison && (
          <p className="text-xs text-muted-foreground mt-0.5">{comparisonLabel}</p>
        )}

        {extras && extras.length > 0 && (
          <div className="mt-2 pt-2 border-t space-y-1">
            {extras.map(({ label, value: v }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
