import { Skeleton } from '@/components/ui/skeleton'

export function PageLoading({ cols = 4 }: { cols?: number }) {
  return (
    <div className="space-y-5">
      <div className={`grid grid-cols-2 sm:grid-cols-${cols} gap-4`}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-4">
        <Skeleton className="h-[260px] w-full" />
      </div>
    </div>
  )
}

export function PageLoadingTable({ kpiCols = 4, rows = 8 }: { kpiCols?: number; rows?: number }) {
  return (
    <div className="space-y-5">
      <div className={`grid grid-cols-2 sm:grid-cols-${kpiCols} gap-4`}>
        {Array.from({ length: kpiCols }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      <div className="rounded-md border overflow-hidden">
        <div className="bg-muted/50 px-4 py-3 flex gap-4 border-b">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-4 border-b last:border-0">
            {Array.from({ length: 7 }).map((_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PageEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-sm">
      <p>{message}</p>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  )
}

export function PageError({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-sm">
      <p className="text-destructive">Failed to load: {message}</p>
    </div>
  )
}
