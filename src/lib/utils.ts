import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

