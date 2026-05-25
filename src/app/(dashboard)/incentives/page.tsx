import { Construction } from 'lucide-react'

export default function Page() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
      <Construction className="h-12 w-12 text-muted-foreground/50" />
      <h2 className="text-xl font-semibold text-muted-foreground">Coming Soon</h2>
      <p className="text-sm text-muted-foreground/70">This page is under construction.</p>
    </div>
  )
}
