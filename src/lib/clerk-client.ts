'use client'

/**
 * Clerk-safe client hooks.
 *
 * In dev mode the root layout omits <ClerkProvider> (no publishable key), so
 * calling Clerk's hooks directly throws "can only be used within <ClerkProvider>".
 * These wrappers branch on a build-time constant: when Clerk is enabled they
 * delegate to the real hooks, otherwise they return a dev-admin placeholder.
 *
 * Branching on CLERK_ENABLED is safe under the rules of hooks because it is a
 * module-level constant — the branch taken never changes between renders.
 */
import {
  useUser as useClerkUser,
  useClerk as useClerkClerk,
  useSignIn as useClerkSignIn,
} from '@clerk/nextjs'

export const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

// Dev mode treats every request as admin (see lib/auth.ts DEV_MODE bypass).
const DEV_USER = {
  fullName: 'Developer',
  primaryEmailAddress: { emailAddress: 'dev@localhost' },
  imageUrl: '',
  publicMetadata: { role: 'admin' },
} as unknown as NonNullable<ReturnType<typeof useClerkUser>['user']>

export function useUser(): ReturnType<typeof useClerkUser> {
  if (CLERK_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useClerkUser()
  }
  return { isLoaded: true, isSignedIn: true, user: DEV_USER } as ReturnType<typeof useClerkUser>
}

export function useSignOut(): ReturnType<typeof useClerkClerk>['signOut'] {
  if (CLERK_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useClerkClerk().signOut
  }
  return (() => {
    window.location.href = '/login'
  }) as ReturnType<typeof useClerkClerk>['signOut']
}

export function useSignIn(): ReturnType<typeof useClerkSignIn> {
  if (CLERK_ENABLED) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useClerkSignIn()
  }
  return { isLoaded: false, signIn: undefined, setActive: undefined } as ReturnType<typeof useClerkSignIn>
}
