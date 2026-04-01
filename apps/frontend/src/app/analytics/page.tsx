"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { FileText, Loader2 } from "lucide-react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"

interface Activity {
  startDate: string
  durationSeconds: number | null
  distanceMeters: number | null
  averageHeartRate: number | null
}

interface WeeklyReport {
  id: string
  weekStart: string
  summary: string
  metrics: {
    totalDistance: number
    totalDuration: number
    avgHR: number | null
    sessions: number
    atl: number
    ctl: number
  }
  generatedAt: string
}

function buildWeeklyChartData(activities: Activity[]) {
  const weeks: Map<
    string,
    { distance: number; duration: number; hrSum: number; hrCount: number }
  > = new Map()

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

export default function AnalyticsPage() {
  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)

  const { data: activityData, isLoading: isLoadingActivities } = useQuery<{
    items: Activity[]
  }>({
    queryKey: ["analytics-activities"],
    queryFn: () =>
      api.get(
        `/activities?limit=200&from=${eightWeeksAgo.toISOString().slice(0, 10)}`
      ),
  })

  const reportMutation = useMutation({
    mutationFn: () => api.post<WeeklyReport>("/ai/weekly-report"),
  })

  const chartData = activityData ? buildWeeklyChartData(activityData.items) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">8-week training trends</p>
      </div>

      {isLoadingActivities ? (
        <div className="grid gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Distance Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Distance (km)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="distance"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Distance (km)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Duration Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Duration (minutes)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="duration"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Duration (min)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* HR Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Average Heart Rate (bpm)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData.filter((d) => d.avgHR !== null)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgHR"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Avg HR (bpm)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Weekly Report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Weekly Report
          </CardTitle>
          <CardDescription>AI-generated analysis of your current training week</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => reportMutation.mutate()}
            disabled={reportMutation.isPending}
          >
            {reportMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Generate this week&apos;s report
              </>
            )}
          </Button>

          {reportMutation.isError && (
            <p className="text-sm text-destructive">{reportMutation.error.message}</p>
          )}

          {reportMutation.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-muted rounded p-3">
                  <p className="text-muted-foreground text-xs">Distance</p>
                  <p className="font-medium">
                    {(reportMutation.data.metrics.totalDistance / 1000).toFixed(1)} km
                  </p>
                </div>
                <div className="bg-muted rounded p-3">
                  <p className="text-muted-foreground text-xs">Duration</p>
                  <p className="font-medium">
                    {Math.round(reportMutation.data.metrics.totalDuration / 60)} min
                  </p>
                </div>
                <div className="bg-muted rounded p-3">
                  <p className="text-muted-foreground text-xs">Sessions</p>
                  <p className="font-medium">{reportMutation.data.metrics.sessions}</p>
                </div>
                <div className="bg-muted rounded p-3">
                  <p className="text-muted-foreground text-xs">Avg HR</p>
                  <p className="font-medium">
                    {reportMutation.data.metrics.avgHR ?? "N/A"} bpm
                  </p>
                </div>
                <div className="bg-muted rounded p-3">
                  <p className="text-muted-foreground text-xs">ATL</p>
                  <p className="font-medium">{reportMutation.data.metrics.atl}</p>
                </div>
                <div className="bg-muted rounded p-3">
                  <p className="text-muted-foreground text-xs">CTL</p>
                  <p className="font-medium">{reportMutation.data.metrics.ctl}</p>
                </div>
              </div>

              <div className="prose prose-sm max-w-none">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {reportMutation.data.summary}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Generated {new Date(reportMutation.data.generatedAt).toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
