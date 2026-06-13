'use client'

import { useEffect } from 'react'
import { useBuild } from '@/context/BuildContext'

const PREFETCH_ROUTES = [
  '/api/data/overview',
  '/api/data/sales',
  '/api/data/telesales',
  '/api/data/mart-freshness',
]

export function Prefetcher() {
  const { buildVersion } = useBuild()

  useEffect(() => {
    PREFETCH_ROUTES.forEach(url =>
      fetch(url).catch(() => {})
    )
  }, [buildVersion])

  return null
}
