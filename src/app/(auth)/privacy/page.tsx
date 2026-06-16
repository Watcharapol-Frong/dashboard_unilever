import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — Unilever Project',
}

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: June 2026</p>
        </div>

        <div className="space-y-8 text-sm leading-7 text-muted-foreground">

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">1. Overview</h2>
            <p>
              This Privacy Policy explains how the Makro × Unilever Dashboard ("the Service") collects, uses, and protects information about you when you use the Service. By using the Service, you agree to the practices described in this policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">2. Information We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="text-foreground font-medium">Account information</span> — your name and email address provided at registration</li>
              <li><span className="text-foreground font-medium">Authentication data</span> — sign-in timestamps and session tokens managed securely by Clerk</li>
              <li><span className="text-foreground font-medium">Usage data</span> — pages visited, actions taken, and features used within the Service</li>
              <li><span className="text-foreground font-medium">Device and browser data</span> — IP address, browser type, and operating system for security purposes</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Authenticate your identity and manage your session</li>
              <li>Provide access to dashboards and reports appropriate to your role</li>
              <li>Monitor for unauthorised access or security incidents</li>
              <li>Improve the reliability and performance of the Service</li>
            </ul>
            <p>
              We do not sell, rent, or share your personal information with third parties for marketing purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">4. Authentication Provider</h2>
            <p>
              Authentication is handled by <span className="text-foreground font-medium">Clerk</span>, a third-party identity provider. Sign-in codes (OTP) are sent via email through Clerk's secure infrastructure. By using the Service, you also agree to Clerk's Privacy Policy. We do not store passwords.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">5. Data Storage and Security</h2>
            <p>
              Business data is stored in a CockroachDB serverless database hosted on AWS (Asia Pacific). Uploaded files are stored in Cloudflare R2 and encrypted at rest using AES-256-GCM. We implement industry-standard security measures to protect your data against unauthorised access, alteration, or loss.
            </p>
            <p>
              While we take reasonable precautions, no system is completely secure. We cannot guarantee the absolute security of your information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">6. Data Retention</h2>
            <p>
              We retain your account information for as long as your account is active. If your account is deactivated or removed by an administrator, your personal information will be deleted within 30 days, except where retention is required by law or for legitimate business purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
            </ul>
            <p>
              To exercise these rights, contact your system administrator.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">8. Cookies and Sessions</h2>
            <p>
              The Service uses secure, HTTP-only session cookies managed by Clerk to maintain your authenticated session. These cookies are strictly necessary for the Service to function and do not track you across other websites.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify active users of significant changes where reasonably possible. Continued use of the Service after changes are posted constitutes your acceptance of the revised policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">10. Contact</h2>
            <p>
              If you have any questions or concerns about this Privacy Policy, please contact your system administrator.
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-12 pt-8 border-t flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground underline underline-offset-4 transition-colors">
            Terms of Service
          </Link>
          <Link href="/login" className="hover:text-foreground underline underline-offset-4 transition-colors">
            Back to Sign in
          </Link>
        </div>

      </div>
    </div>
  )
}
