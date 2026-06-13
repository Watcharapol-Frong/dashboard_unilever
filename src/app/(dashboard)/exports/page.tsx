import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function ExportsPage() {
  const { sessionClaims } = await auth()
  if (sessionClaims?.publicMetadata?.role !== 'admin') redirect('/overview')
  return <div />
}
