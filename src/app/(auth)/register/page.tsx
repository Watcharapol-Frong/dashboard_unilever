'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'

export default function RegisterPage() {
  const router = useRouter()
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth()

  useEffect(() => {
    if (isAuthLoaded && isSignedIn) {
      router.push('/overview')
    }
  }, [isAuthLoaded, isSignedIn, router])

  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, inviteCode }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Registration failed'); return }
      router.push('/login?registered=true')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {/* Header */}
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex size-10 items-center justify-center rounded-md bg-[#003DA6] text-white font-bold text-lg select-none">
                  U
                </div>
                <h1 className="text-xl font-bold">Create an account</h1>
                <FieldDescription>
                  Already have an account?{' '}
                  <Link href="/login">Sign in</Link>
                </FieldDescription>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your full name"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">
                  Email <span className="text-destructive">*</span>
                </FieldLabel>
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
                <FieldLabel htmlFor="invite-code">
                  Invite code <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="invite-code"
                  type="text"
                  required
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder="Enter your invite code"
                  className="font-mono"
                />
                <FieldDescription>Contact your administrator to get an invite code.</FieldDescription>
              </Field>

              <Field>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? 'Creating account…' : 'Create account'}
                </Button>
              </Field>
            </FieldGroup>
          </form>

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
