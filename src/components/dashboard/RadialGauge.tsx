"use client"

import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatTHB, formatPct } from "@/lib/utils"

interface RadialGaugeProps {
  online: number
  offline: number
  target: number
  height?: number
}

const chartConfig = {
  online: { label: "Online", color: "#003DA6" },
  offline: { label: "Offline", color: "#EE2737" },
} satisfies ChartConfig

export function RadialGauge({ online, offline, target }: RadialGaugeProps) {
  const total = online + offline
  const pct = target > 0 ? Math.min(total / target, 1) : 0

  // Recharts RadialBarChart with endAngle=180 (half-donut) stacked
  // Scale values proportionally to fill the half-circle based on target
  const scale = target > 0 ? 180 / target : 0
  const onlineAngle = online * scale
  const offlineAngle = offline * scale

  const chartData = [
    {
      name: "achievement",
      online: Math.max(online, 0),
      offline: Math.max(offline, 0),
    },
  ]

  return (
    <div className="flex flex-col items-center">
      <ChartContainer config={chartConfig} className="w-full max-w-[280px]" style={{ height: 180 }}>
        <RadialBarChart
          data={chartData}
          endAngle={180}
          innerRadius={70}
          outerRadius={110}
        >
          <PolarGrid gridType="circle" radialLines={false} stroke="none"
            className="first:fill-muted last:fill-background" />
          <RadialBar
            dataKey="offline"
            fill="var(--color-offline)"
            stackId="a"
            cornerRadius={4}
            className="stroke-transparent stroke-2"
          />
          <RadialBar
            dataKey="online"
            fill="var(--color-online)"
            stackId="a"
            cornerRadius={4}
            className="stroke-transparent stroke-2"
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => (
                  <span>{name === "online" ? "Online" : "Offline"}: {formatTHB(Number(value))}</span>
                )}
              />
            }
          />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 14}
                        className="fill-foreground text-3xl font-bold"
                        style={{ fontSize: 28, fontWeight: 700 }}
                      >
                        {(pct * 100).toFixed(1)}%
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 8}
                        className="fill-muted-foreground"
                        style={{ fontSize: 12, fill: "#6b7280" }}
                      >
                        {target > 0 ? `of ${formatTHB(target)}` : "No target"}
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>
      <div className="flex items-center gap-4 text-xs mt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#003DA6]" />
          Online: {formatTHB(online)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#EE2737]" />
          Offline: {formatTHB(offline)}
        </span>
      </div>
    </div>
  )
}
