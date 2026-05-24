import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Exports' }

export default async function ExportsPage() {
  const { sessionClaims } = await auth()
  if (sessionClaims?.publicMetadata?.role !== 'admin') redirect('/overview')

  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Exports — coming soon
    </div>
  )
}
