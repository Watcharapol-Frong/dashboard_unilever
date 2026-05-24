'use client'

import { SignIn } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function LoginContent() {
  const params     = useSearchParams()
  const registered = params.get('registered') === 'true'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003DA6] to-[#001e6e] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Unilever Project</h1>
          <p className="text-white/60 mt-2">Sign in to continue</p>
        </div>

        {registered && (
          <div className="mb-4 bg-green-500/20 border border-green-400/40 text-green-100 text-sm rounded-lg px-4 py-3 text-center">
            ✓ Account created successfully — you can now sign in
          </div>
        )}

        <SignIn
          path="/login"
          routing="path"
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-2xl rounded-2xl border-0',
              headerTitle: 'hidden',
              headerSubtitle: 'hidden',
              formButtonPrimary: 'bg-[#003DA6] hover:bg-[#002d80]',
              footer: 'hidden',
            },
          }}
        />

        <p className="text-center text-sm text-white/50 mt-4">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-white font-semibold hover:underline">
            Register with invite code
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
