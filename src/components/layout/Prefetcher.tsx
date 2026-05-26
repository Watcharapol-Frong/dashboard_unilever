'use client'

import { useEffect } from 'react'
import { useBuild } from '@/context/BuildContext'

const PREFETCH_ROUTES = [
  '/api/data/overview',
  '/api/data/products/options',
  '/api/data/sales',
  '/api/data/telesales',
  '/api/data/leads/summary',
  '/api/data/cohorts',
  '/api/data/mart-freshness',
]

export function Prefetcher() {
  const { buildVersion } = useBuild()

  useEffect(() => {
    PREFETCH_ROUTES.forEach(url =>
      fetch(url).catch(() => {}) // fire-and-forget, ignore errors
    )
  }, [buildVersion]) // re-prefetch after mart rebuild

  return null
}
