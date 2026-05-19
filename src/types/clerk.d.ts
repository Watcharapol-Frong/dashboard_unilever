export {}

declare global {
  interface CustomJwtSessionClaims {
    publicMetadata: {
      role?: 'admin' | 'viewer'
    }
  }
}
