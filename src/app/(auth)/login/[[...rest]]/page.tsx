'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

type Step = 'credentials' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()

  const [step, setStep]       = useState<Step>('credentials')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp]         = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    router.replace('/dashboard')
    return null
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoaded) return
    setError('')
    setLoading(true)

    try {
      const result = await signIn.create({ identifier: email, password })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/dashboard')
        return
      }

      // Email code verification required
      if (result.status === 'needs_first_factor') {
        const emailFactor = result.supportedFirstFactors?.find(
          f => f.strategy === 'email_code'
        )
        if (emailFactor && 'emailAddressId' in emailFactor) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          })
          setStep('otp')
          return
        }
      }

      setError('Unexpected sign-in state. Please try again.')
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
      setError(msg ?? 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoaded) return
    setError('')
    setLoading(true)

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code: otp,
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/dashboard')
        return
      }

      setError('Verification failed. Please try again.')
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
      setError(msg ?? 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-white px-8 py-10 shadow-sm">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {step === 'credentials' ? 'Sign in' : 'Check your email'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 'credentials'
              ? 'Enter your email and password to continue'
              : `We sent a verification code to ${email}`}
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {/* Step 1 — Email + Password */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !isLoaded}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        )}

        {/* Step 2 — OTP */}
        {step === 'otp' && (
          <form onSubmit={handleOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="otp">Verification code</Label>
              <Input
                id="otp"
                placeholder="6-digit code"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                autoFocus
                maxLength={6}
                inputMode="numeric"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify
            </Button>
            <button
              type="button"
              onClick={() => { setStep('credentials'); setOtp(''); setError('') }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
          </form>
        )}

        {/* Register link */}
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Register
          </Link>
        </p>
      </div>

      {/* Terms & Privacy */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        By signing in, you agree to our{' '}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy Policy
        </Link>
      </p>
    </div>
  )
}
