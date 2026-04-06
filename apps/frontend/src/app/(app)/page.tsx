"use client"

import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, streamPost } from "@/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, HelpCircle, RefreshCw, TrendingDown, TrendingUp, Zap } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface TrainingLoad {
  atl: number
  ctl: number
  tsb: number
}

interface ActivityItem {
  id: string
  name: string | null
  sportType: string
  startDate: string
  durationSeconds: number | null
  distanceMeters: number | null
  averageHeartRate: number | null
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`
}

function buildWeeklyChartData(activities: ActivityItem[]) {
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

const chartTooltipStyle = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(24px)",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: "12px",
  boxShadow: "0 8px 32px rgba(70,100,200,0.14)",
  fontSize: "12px",
}

function SportBadge({ sport }: { sport: string }) {
  const colors: Record<string, string> = {
    run: "bg-orange-500/15 text-orange-700 border-orange-400/25",
    ride: "bg-blue-500/15 text-blue-700 border-blue-400/25",
    swim: "bg-cyan-500/15 text-cyan-700 border-cyan-400/25",
    walk: "bg-green-500/15 text-green-700 border-green-400/25",
    hike: "bg-emerald-500/15 text-emerald-700 border-emerald-400/25",
  }
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium capitalize ${colors[sport] ?? "bg-white/10 text-foreground/65 border-white/20"}`}
    >
      {sport}
    </span>
  )
}

function MetricHint({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center">
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 rounded-xl bg-white/90 border border-white/80 text-gray-800 text-sm px-4 py-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 leading-relaxed backdrop-blur-2xl">
        {text}
      </span>
    </span>
  )
}

export default function Dashboard() {
  const qc = useQueryClient()
  const [recommendation, setRecommendation] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)

  const { data: stats } = useQuery<TrainingLoad>({
    queryKey: ["stats"],
    queryFn: () => api.get("/activities/stats"),
  })

  const { data: recentData } = useQuery<{ items: ActivityItem[]; total: number }>({
    queryKey: ["recent-activities"],
    queryFn: () => api.get("/activities?limit=5"),
  })

  const { data: chartActivities } = useQuery<{ items: ActivityItem[] }>({
    queryKey: ["chart-activities"],
    queryFn: () =>
      api.get(`/activities?limit=200&from=${eightWeeksAgo.toISOString().slice(0, 10)}`),
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ synced: number }>("/strava/sync"),
    onSuccess: (data) => {
      setSyncResult(`Synced ${data.synced} activities`)
      qc.invalidateQueries({ queryKey: ["recent-activities"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
      qc.invalidateQueries({ queryKey: ["chart-activities"] })
    },
  })

  const handleRecommendation = async () => {
    setRecommendation("")
    setIsStreaming(true)
    try {
      await streamPost("/ai/recommendation", {}, (text) => {
        setRecommendation((prev) => prev + text)
      })
    } finally {
      setIsStreaming(false)
    }
  }

  const tsb = stats?.tsb ?? 0
  const tsbLabel = tsb > 5 ? "Fresh" : tsb < -10 ? "Fatigued" : "Moderate"
  const tsbColor = tsb > 5 ? "text-emerald-600" : tsb < -10 ? "text-red-500" : "text-amber-600"
  const tsbBadgeClass =
    tsb > 5
      ? "border-emerald-400/40 bg-emerald-50 text-emerald-700"
      : tsb < -10
        ? "border-red-400/40 bg-red-50 text-red-700"
        : "border-amber-400/40 bg-amber-50 text-amber-700"

  const weeklyData = chartActivities ? buildWeeklyChartData(chartActivities.items) : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Your training overview</p>
        </div>
        <div className="flex gap-2.5 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync Strava
          </Button>
          <Button size="sm" onClick={handleRecommendation} disabled={isStreaming} className="gap-2">
            <Zap className="h-3.5 w-3.5" />
            {isStreaming ? "Getting recommendation…" : "Get recommendation"}
          </Button>
        </div>
      </div>

      {syncResult && <p className="text-sm text-emerald-600">{syncResult}</p>}

      {/* Training Load — 3 cols */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* ATL */}
        <Card>
          <CardHeader className="pb-2 pt-5 px-5">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              Acute Load (ATL)
              <MetricHint text="Short-term fatigue (7-day EWMA). Rises quickly with hard training, drops fast with rest. Low <20 · Moderate 20–60 · High >60." />
            </CardDescription>
            <CardTitle className="text-5xl font-semibold tabular-nums text-amber-600 leading-none mt-1">
              {stats?.atl ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-black/6 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all"
                  style={{ width: `${Math.min(100, ((stats?.atl ?? 0) / 80) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">7d</span>
            </div>
          </CardContent>
        </Card>

        {/* CTL */}
        <Card>
          <CardHeader className="pb-2 pt-5 px-5">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              Chronic Load (CTL)
              <MetricHint text="Long-term fitness base (42-day EWMA). Builds slowly with consistent training. Beginner <30 · Recreational 30–70 · Competitive >70." />
            </CardDescription>
            <CardTitle className="text-5xl font-semibold tabular-nums text-blue-600 leading-none mt-1">
              {stats?.ctl ?? "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-black/6 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all"
                  style={{ width: `${Math.min(100, ((stats?.ctl ?? 0) / 100) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">42d</span>
            </div>
          </CardContent>
        </Card>

        {/* TSB */}
        <Card>
          <CardHeader className="pb-2 pt-5 px-5">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              Form (TSB)
              <MetricHint text="Form = CTL − ATL. Very fresh >+10 · Fresh +5 to +10 · Neutral −5 to +5 · Tired −10 to −5 · Fatigued <−10." />
              {tsb > 5 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : tsb < -10 ? (
                <TrendingDown className="h-3 w-3 text-red-400" />
              ) : null}
            </CardDescription>
            <CardTitle
              className={`text-5xl font-semibold tabular-nums leading-none mt-1 ${tsbColor}`}
            >
              {stats ? (tsb >= 0 ? `+${tsb}` : tsb) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Badge variant="outline" className={`text-xs ${tsbBadgeClass}`}>
              {tsbLabel}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Trend Charts — 3 cols */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* Distance */}
        <Card>
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-foreground/70">
              Weekly Distance
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={weeklyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradDist" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="distance"
                  stroke="hsl(var(--primary))"
                  fill="url(#gradDist)"
                  strokeWidth={2}
                  dot={false}
                  name="km"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Duration */}
        <Card>
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-foreground/70">
              Weekly Duration
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={weeklyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradDur" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="duration"
                  stroke="#10b981"
                  fill="url(#gradDur)"
                  strokeWidth={2}
                  dot={false}
                  name="min"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Heart Rate */}
        <Card>
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-medium text-foreground/70">Avg Heart Rate</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart
                data={weeklyData.filter((d) => d.avgHR !== null)}
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradHR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="avgHR"
                  stroke="#f97316"
                  fill="url(#gradHR)"
                  strokeWidth={2}
                  dot={false}
                  name="bpm"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendation */}
      {(recommendation || isStreaming) && (
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm flex items-center gap-2 font-medium">
              <Zap className="h-4 w-4 text-primary" />
              Today's Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="prose prose-sm max-w-none text-foreground/85">
              <Markdown>{recommendation}</Markdown>
            </div>
            {isStreaming && <span className="animate-pulse text-primary ml-0.5">▋</span>}
          </CardContent>
        </Card>
      )}

      {/* Recent Activities */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              Recent Activities
            </CardTitle>
            <CardDescription>
              <Link href="/activities" className="text-xs text-primary hover:underline">
                View all {recentData?.total ?? 0} →
              </Link>
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {!recentData?.items?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No activities yet. Connect Strava and sync to get started.
            </p>
          ) : (
            <div className="divide-y divide-black/5">
              {recentData.items.map((a) => (
                <Link
                  key={a.id}
                  href={`/activities/${a.id}`}
                  className="flex items-center justify-between py-3 hover:bg-white/30 -mx-2 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <SportBadge sport={a.sportType} />
                    <div>
                      <p className="text-sm font-medium">{a.name ?? a.sportType}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.startDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground tabular-nums">
                    {a.durationSeconds && <span>{formatDuration(a.durationSeconds)}</span>}
                    {a.distanceMeters && (
                      <span className="ml-3">{formatDistance(a.distanceMeters)}</span>
                    )}
                    {a.averageHeartRate && <span className="ml-3">{a.averageHeartRate} bpm</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
