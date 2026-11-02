"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { localDate } from "@/lib/utils"
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
  weekStart: string // Monday key, yyyy-mm-dd
  distance: number
  duration: number
  avgHR: number | null
}

function mondayKey(date: Date): string {
  const diff = date.getDay() === 0 ? -6 : 1 - date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() + diff)
  return localDate(monday)
}

export function buildWeeklyChartData(activities: ChartActivity[]): WeeklyPoint[] {
  const weeks = new Map<
    string,
    { distance: number; duration: number; hrSum: number; hrCount: number }
  >()

  for (const a of activities) {
    const key = mondayKey(new Date(a.startDate))

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
      week: new Date(`${week}T00:00:00`).toLocaleDateString("en-GB", {
        month: "short",
        day: "numeric",
      }),
      weekStart: week,
      distance: Math.round(data.distance * 10) / 10,
      duration: Math.round(data.duration),
      avgHR: data.hrCount > 0 ? Math.round(data.hrSum / data.hrCount) : null,
    }))
}

function weekLabel(weekStart: string): string {
  if (weekStart === mondayKey(new Date())) return "This week"
  return `Week of ${new Date(weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`
}

const tick = { fontSize: 10, fill: "hsl(var(--muted-foreground))" }

export function WeeklyChart({
  title,
  dataKey,
  data,
  color,
  format,
  error = false,
}: Readonly<{
  title: string
  dataKey: "distance" | "duration" | "avgHR"
  data: WeeklyPoint[]
  color: string
  format: (v: number) => string
  error?: boolean
}>) {
  const rows = dataKey === "avgHR" ? data.filter((d) => d.avgHR !== null) : data
  const latest = rows.at(-1)
  const last = latest?.[dataKey] ?? null
  // Compare with the calendar week directly before the latest week, not the previous week with data.
  const prevStart = latest
    ? new Date(new Date(latest.weekStart).getTime() - 7 * 864e5).toISOString().slice(0, 10)
    : null
  const prev = rows.find((d) => d.weekStart === prevStart)?.[dataKey] ?? null
  const delta = last !== null && prev ? Math.round(((last - prev) / prev) * 100) : null
  const label = latest ? weekLabel(latest.weekStart) : ""
  const seriesName = { distance: "Distance", duration: "Duration", avgHR: "Avg HR" }[dataKey]
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
        {label && <p className="text-xs text-muted-foreground">{label}</p>}
      </CardHeader>
      <CardContent>
        {error || rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {error ? "Couldn't load activities" : "No activities yet"}
          </p>
        ) : (
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
                formatter={(v) => [format(Number(v)), seriesName]}
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
        )}
      </CardContent>
    </Card>
  )
}
