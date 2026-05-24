import { Skeleton } from '@/components/ui/skeleton'

export function PageLoading() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
