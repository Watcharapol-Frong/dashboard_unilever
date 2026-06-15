import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Makro × Unilever Dashboard',
  description: 'Home Care Category Manager Dashboard',
}

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = (
    <html lang="th" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>{children}</body>
    </html>
  )

  // In dev mode (no Clerk key configured), skip ClerkProvider to avoid errors
  return PUBLISHABLE_KEY ? <ClerkProvider>{content}</ClerkProvider> : content
}
