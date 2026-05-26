'use client'

import { useState, Suspense, useEffect } from 'react'
import { useSignIn, useAuth } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'

function LoginForm() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth()
  const router      = useRouter()
  const params      = useSearchParams()
  const registered  = params.get('registered') === 'true'

  useEffect(() => {
    if (isAuthLoaded && isSignedIn) {
      router.push('/overview')
    }
  }, [isAuthLoaded, isSignedIn, router])

  const [email,   setEmail]   = useState('')
  const [code,    setCode]    = useState('')
  const [step,    setStep]    = useState<'email' | 'otp'>('email')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded) return
    setError('')
    setLoading(true)
    try {
      const attempt = await signIn.create({ identifier: email })
      const factor  = attempt.supportedFirstFactors?.find(
        f => f.strategy === 'email_code'
      ) as { emailAddressId: string } | undefined
      if (!factor) throw new Error('Email OTP not available')
      await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId })
      setStep('otp')
    } catch (err: unknown) {
      const e = err as { errors?: { message: string }[] }
      setError(e.errors?.[0]?.message ?? 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded) return
    setError('')
    setLoading(true)
    try {
      const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/overview')
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message: string }[] }
      setError(e.errors?.[0]?.message ?? 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">

          <FieldGroup>
            {/* Header */}
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex size-10 items-center justify-center rounded-md bg-[#003DA6] text-white font-bold text-lg select-none">
                U
              </div>
              <h1 className="text-xl font-bold">
                {step === 'email' ? 'Welcome' : 'Check your email'}
              </h1>
              <FieldDescription>
                {step === 'email' ? (
                  <>Don&apos;t have an account?{' '}<Link href="/register">Register</Link></>
                ) : (
                  <>Enter the code sent to <span className="text-foreground font-medium">{email}</span></>
                )}
              </FieldDescription>
            </div>

            {/* Registered success banner */}
            {registered && step === 'email' && (
              <p className="text-sm text-center text-green-600 bg-green-50 border border-green-200 rounded-md px-4 py-2.5">
                ✓ Account created — sign in below
              </p>
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            {/* Email step */}
            {step === 'email' && (
              <form onSubmit={sendCode}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Field>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Sending…' : 'Continue with email'}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            )}

            {/* OTP step */}
            {step === 'otp' && (
              <form onSubmit={verifyCode}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="code">One-time code</FieldLabel>
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      autoFocus
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      placeholder="000000"
                      className="font-mono text-center tracking-widest text-lg"
                    />
                  </Field>
                  <Field>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Verifying…' : 'Sign in'}
                    </Button>
                  </Field>
                  <Field>
                    <button
                      type="button"
                      onClick={() => { setStep('email'); setCode(''); setError('') }}
                      className="w-full text-sm text-muted-foreground hover:text-foreground text-center transition-colors"
                    >
                      Use a different email
                    </button>
                  </Field>
                </FieldGroup>
              </form>
            )}
          </FieldGroup>

          {/* Terms */}
          <FieldDescription className="text-center px-6">
            By continuing, you agree to our{' '}
            <Link href="/terms">Terms of Service</Link>{' '}
            and <Link href="/privacy">Privacy Policy</Link>.
          </FieldDescription>

        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
