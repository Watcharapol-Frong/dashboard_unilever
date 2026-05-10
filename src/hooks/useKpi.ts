import useSWR from 'swr'
import { toISODateString } from '@/lib/utils'
import { useDateRange } from '@/context/DateRangeContext'

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error('API error')
  return r.json()
})

export function useKpi<T>(path: string, extra?: Record<string, string>) {
  const { range, prevRange } = useDateRange()
  const params = new URLSearchParams({
    from: toISODateString(range.from),
    to: toISODateString(range.to),
    prev_from: toISODateString(prevRange.from),
    prev_to: toISODateString(prevRange.to),
    ...extra,
  })
  return useSWR<T>(`${path}?${params}`, fetcher, { revalidateOnFocus: false })
}
