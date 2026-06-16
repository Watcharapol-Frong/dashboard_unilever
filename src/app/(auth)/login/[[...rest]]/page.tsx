'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Loader2 } from 'lucide-react'

type Step = 'email' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, setActive, isLoaded } = useSignIn()

  const [step, setStep]   = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp]     = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
    router.replace('/dashboard')
    return null
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoaded) return
    setError('')
    setLoading(true)

    try {
      const result = await signIn.create({ identifier: email })

      const emailFactor = result.supportedFirstFactors?.find(
        f => f.strategy === 'email_code'
      )
      if (!emailFactor || !('emailAddressId' in emailFactor)) {
        setError('Email sign-in is not enabled. Contact your administrator.')
        return
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      })
      setStep('otp')
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message
      setError(msg ?? 'Email not found. Please register first.')
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
      setError(msg ?? 'Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-white px-8 py-10 shadow-sm">

        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {step === 'email' ? 'Sign in' : 'Check your email'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 'email'
              ? 'Enter your email to receive a sign-in code'
              : `We sent a 6-digit code to ${email}`}
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {step === 'email' && (
          <form onSubmit={handleEmail} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={loading || !isLoaded}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send code
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtp} className="space-y-4">
            <div className="space-y-3">
              <Label htmlFor="otp">Verification code</Label>
              <InputOTP
                id="otp"
                maxLength={6}
                value={otp}
                onChange={setOtp}
                autoFocus
              >
                <InputOTPGroup className="w-full justify-center gap-3">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setError('') }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              ← Use a different email
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Register
          </Link>
        </p>
      </div>

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
