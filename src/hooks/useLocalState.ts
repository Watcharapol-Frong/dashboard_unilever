'use client'

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react'

/**
 * Drop-in replacement for useState that persists the value in localStorage.
 * Safe for SSR: starts with defaultValue on server/hydration, then restores
 * from localStorage in a useEffect (after mount).
 */
export function useLocalState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue)

  // Restore persisted value after hydration
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) setValue(JSON.parse(stored) as T)
    } catch { /* ignore parse / storage errors */ }
  }, [key])

  const set: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      setValue(prev => {
        const next = typeof action === 'function'
          ? (action as (prev: T) => T)(prev)
          : action
        try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
    },
    [key],
  )

  return [value, set]
}
