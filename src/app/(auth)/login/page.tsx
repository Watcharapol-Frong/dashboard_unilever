'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Mail, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
    })

    if (err) setError(err.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003DA6] to-[#001e6e] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logos/Branding */}
        <div className="text-center text-white space-y-2">
          <div className="text-xs uppercase tracking-widest text-white/60 font-semibold">Makro Pro × Unilever × Telesales</div>
          <h1 className="text-3xl font-bold">Home Care Dashboard</h1>
          <p className="text-white/60 text-sm">Category Manager — Collaboration Platform</p>
        </div>

        <Card>
          <CardHeader className="text-center pb-3">
            {sent ? (
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            ) : (
              <Mail className="h-12 w-12 text-[#003DA6] mx-auto mb-2" />
            )}
            <CardTitle>{sent ? 'Check your email' : 'Sign in'}</CardTitle>
            <CardDescription>
              {sent
                ? `We sent a magic link to ${email}. Click the link to access the dashboard.`
                : 'Enter your email to receive a secure magic link'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sent ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Magic Link'}
                </Button>
              </form>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                Try different email
              </Button>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-white/40 text-xs">
          Access is by invitation only. Contact the Makro team if you need access.
        </p>
      </div>
    </div>
  )
}
