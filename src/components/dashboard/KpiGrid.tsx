import { cn } from '@/lib/utils'

interface KpiGridProps {
  children: React.ReactNode
  cols?: 2 | 3 | 4 | 6
  className?: string
}

const colClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
}

export function KpiGrid({ children, cols = 4, className }: KpiGridProps) {
  return (
    <div className={cn('grid gap-4', colClass[cols], className)}>
      {children}
    </div>
  )
}
