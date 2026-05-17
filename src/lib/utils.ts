import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTHB(value: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('th-TH').format(value)
}

export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function getStatusColor(pct: number): string {
  if (pct >= 0.9) return 'text-green-600'
  if (pct >= 0.7) return 'text-amber-500'
  return 'text-red-500'
}

export function getProgressColor(pct: number): string {
  if (pct >= 0.9) return 'bg-green-500'
  if (pct >= 0.7) return 'bg-amber-400'
  return 'bg-red-500'
}

export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatPeriodLabel(period: string, groupBy: 'month' | 'week' | 'day'): string {
  // Parse as local date (avoid UTC shift)
  const [y, m, d] = period.split('-').map(Number)
  const date = new Date(y, m - 1, d)

  if (groupBy === 'month') {
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
  }
  if (groupBy === 'week') {
    const end = new Date(date)
    end.setDate(date.getDate() + 6)
    const startStr = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
    const endStr   = `${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`
    return `${startStr}–${endStr}`
  }
  // day
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
}
