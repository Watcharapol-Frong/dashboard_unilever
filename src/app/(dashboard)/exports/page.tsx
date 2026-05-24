import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import ExportsClient from './_components/ExportsClient'

export const metadata = { title: 'Exports' }

export default async function ExportsPage() {
  const { sessionClaims } = await auth()
  if (sessionClaims?.publicMetadata?.role !== 'admin') redirect('/overview')
  return <ExportsClient />
}
