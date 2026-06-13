'use client'

import { useEffect } from 'react'
import { useBuild } from '@/context/BuildContext'

const PREFETCH_ROUTES = [
  '/api/data/dashboard',
  '/api/data/dashboard/sales',
  '/api/data/dashboard/telesales',
  '/api/data/hub/freshness',
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
