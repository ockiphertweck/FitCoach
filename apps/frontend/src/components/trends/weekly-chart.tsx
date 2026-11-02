"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export interface ChartActivity {
  startDate: string
  durationSeconds: number | null
  distanceMeters: number | null
  averageHeartRate: number | null
}

export interface WeeklyPoint {
  week: string
  distance: number
  duration: number
  avgHR: number | null
}

export function buildWeeklyChartData(activities: ChartActivity[]): WeeklyPoint[] {
  const weeks = new Map<
    string,
    { distance: number; duration: number; hrSum: number; hrCount: number }
  >()

  for (const a of activities) {
    const date = new Date(a.startDate)
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(date)
    monday.setDate(date.getDate() + diff)
    const key = monday.toISOString().slice(0, 10)

    const existing = weeks.get(key) ?? { distance: 0, duration: 0, hrSum: 0, hrCount: 0 }
    existing.distance += (a.distanceMeters ?? 0) / 1000
    existing.duration += (a.durationSeconds ?? 0) / 60
    if (a.averageHeartRate) {
      existing.hrSum += a.averageHeartRate
      existing.hrCount++
    }
    weeks.set(key, existing)
  }

  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([week, data]) => ({
      week: new Date(week).toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
      distance: Math.round(data.distance * 10) / 10,
      duration: Math.round(data.duration),
      avgHR: data.hrCount > 0 ? Math.round(data.hrSum / data.hrCount) : null,
    }))
}

const tick = { fontSize: 10, fill: "hsl(var(--muted-foreground))" }

export function WeeklyChart({
  title,
  dataKey,
  data,
  color,
  format,
}: {
  title: string
  dataKey: "distance" | "duration" | "avgHR"
  data: WeeklyPoint[]
  color: string
  format: (v: number) => string
}) {
  const rows = dataKey === "avgHR" ? data.filter((d) => d.avgHR !== null) : data
  const last = rows.at(-1)?.[dataKey] ?? null
  const prev = rows.at(-2)?.[dataKey] ?? null
  const delta = last !== null && prev ? Math.round(((last - prev) / prev) * 100) : null
  const gid = `grad-${dataKey}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {last !== null ? format(last) : "—"}
          </span>
          {delta !== null && (
            <span
              data-testid={`delta-${dataKey}`}
              className="text-xs font-semibold text-muted-foreground"
            >
              {delta >= 0 ? "+" : "−"}
              {Math.abs(delta)}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={rows} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tick={tick} axisLine={false} tickLine={false} />
            <YAxis
              tick={tick}
              axisLine={false}
              tickLine={false}
              domain={dataKey === "avgHR" ? ["auto", "auto"] : undefined}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                color: "hsl(var(--popover-foreground))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={`url(#${gid})`}
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
