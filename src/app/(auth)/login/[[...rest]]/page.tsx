import { redirect } from 'next/navigation'
import { SignIn } from '@clerk/nextjs'

export default function LoginPage() {
  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignIn />
    </div>
  )
}
