import useSWR, { SWRConfiguration } from 'swr'
import { useBuild } from '@/context/BuildContext'

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json.data
}

export function useDashboardSWR<T>(url: string, overrides?: SWRConfiguration<T>) {
  const { buildVersion } = useBuild()
  return useSWR<T>([url, buildVersion], ([u]: [string]) => fetcher(u), {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000,
    ...overrides,
  })
}
