'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import type { ReactElement } from 'react'

interface ChartCardProps {
  title: string
  height?: number
  className?: string
  children: ReactElement
}

export function ChartCard({ title, height = 300, className, children }: ChartCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
