import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { DataHubClient } from './_components/DataHubClient'

export default async function DataHubPage() {
  const { sessionClaims } = await auth()
  if (sessionClaims?.publicMetadata?.role !== 'admin') redirect('/overview')
  return <DataHubClient />
}
