import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service — Unilever Project',
}

export default function TermsPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-12 md:py-20">

        {/* Back */}
        <Button variant="ghost" size="sm" asChild className="mb-8 -ml-2 text-muted-foreground">
          <Link href="/login">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: June 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-7 text-muted-foreground">

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Makro × Unilever Dashboard ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not access or use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">2. Access and Account</h2>
            <p>
              Access to the Service is restricted to authorised personnel only. You must have a valid invite code to register. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>
            <p>
              You must notify your administrator immediately if you believe your account has been compromised or accessed without authorisation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">3. Permitted Use</h2>
            <p>
              The Service is provided solely for internal business purposes relating to the Makro × Unilever partnership. You agree to use the Service only for its intended purpose and in compliance with all applicable laws and regulations.
            </p>
            <p>You must not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Share, distribute, or disclose any data or reports outside the organisation without authorisation</li>
              <li>Attempt to reverse-engineer, modify, or tamper with the Service</li>
              <li>Use the Service for any unlawful or unauthorised purpose</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its data</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">4. Data and Confidentiality</h2>
            <p>
              All sales data, performance metrics, and business information accessible through the Service are confidential and proprietary. You agree to treat all such information as strictly confidential and not to disclose it to any third party.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">5. Intellectual Property</h2>
            <p>
              All content, features, and functionality of the Service are owned by the respective rights holders and are protected by applicable intellectual property laws. Nothing in these Terms grants you any right, title, or interest in the Service beyond the limited access rights described herein.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">6. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at any time, with or without notice, for any reason including breach of these Terms. Upon termination, your right to use the Service will immediately cease.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">7. Disclaimer</h2>
            <p>
              The Service is provided "as is" without warranty of any kind. We do not warrant that the Service will be uninterrupted, error-free, or completely secure. Data displayed is for informational purposes and may not always reflect real-time figures.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">8. Changes to Terms</h2>
            <p>
              We may update these Terms at any time. Continued use of the Service after changes are posted constitutes your acceptance of the revised Terms. We will notify active users of material changes where reasonably possible.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">9. Contact</h2>
            <p>
              If you have any questions about these Terms, please contact your system administrator.
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-12 pt-8 border-t flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground underline underline-offset-4 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/login" className="hover:text-foreground underline underline-offset-4 transition-colors">
            Back to Sign in
          </Link>
        </div>

      </div>
    </div>
  )
}
