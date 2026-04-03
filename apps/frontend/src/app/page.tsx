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

function SportBadge({ sport }: { sport: string }) {
  const colors: Record<string, string> = {
    run: "bg-orange-100 text-orange-800",
    ride: "bg-blue-100 text-blue-800",
    swim: "bg-cyan-100 text-cyan-800",
    walk: "bg-green-100 text-green-800",
    hike: "bg-emerald-100 text-emerald-800",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[sport] ?? "bg-slate-100 text-slate-700"}`}
    >
      {sport}
    </span>
  )
}

function MetricHint({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center">
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 rounded-md bg-gray-900 text-gray-50 text-sm px-4 py-3 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 leading-relaxed">
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

  const { data: stats } = useQuery<TrainingLoad>({
    queryKey: ["stats"],
    queryFn: () => api.get("/activities/stats"),
  })

  const { data: recentData } = useQuery<{ items: ActivityItem[]; total: number }>({
    queryKey: ["recent-activities"],
    queryFn: () => api.get("/activities?limit=5"),
  })

  const syncMutation = useMutation({
    mutationFn: () => api.post<{ synced: number }>("/strava/sync"),
    onSuccess: (data) => {
      setSyncResult(`Synced ${data.synced} activities`)
      qc.invalidateQueries({ queryKey: ["recent-activities"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
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
  const tsbColor = tsb > 5 ? "text-green-600" : tsb < -10 ? "text-red-600" : "text-yellow-600"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your training overview</p>
      </div>

      {/* Training Load Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              Acute Load (ATL)
              <MetricHint text="Short-term fatigue (7-day EWMA). Rises quickly with hard training, drops fast with rest. Low <20 · Moderate 20–60 · High >60. High ATL means accumulated fatigue — watch for signs of overreaching." />
            </CardDescription>
            <CardTitle className="text-3xl">{stats?.atl ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">7-day training stress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              Chronic Load (CTL)
              <MetricHint text="Long-term fitness base (42-day EWMA). Builds slowly with consistent training. Beginner <30 · Recreational 30–70 · Competitive >70. Higher CTL = bigger aerobic engine, but takes weeks to move." />
            </CardDescription>
            <CardTitle className="text-3xl">{stats?.ctl ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">42-day fitness base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              Form (TSB)
              <MetricHint text="Form = CTL − ATL. Typical range: −30 to +25. Very fresh >+10 · Fresh +5 to +10 · Neutral −5 to +5 · Tired −10 to −5 · Fatigued <−10. Aim for +5 to +15 on race/peak day." />
              {tsb > 5 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : tsb < -10 ? (
                <TrendingDown className="h-3 w-3 text-red-600" />
              ) : null}
            </CardDescription>
            <CardTitle className={`text-3xl ${tsbColor}`}>{stats?.tsb ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className={
                tsb > 5
                  ? "border-green-300 text-green-700"
                  : tsb < -10
                    ? "border-red-300 text-red-700"
                    : "border-yellow-300 text-yellow-700"
              }
            >
              {tsbLabel}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleRecommendation} disabled={isStreaming}>
          <Zap className="h-4 w-4" />
          {isStreaming ? "Getting recommendation…" : "Get today's recommendation"}
        </Button>

        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          Sync Strava
        </Button>

        {syncResult && (
          <Badge variant="outline" className="self-center border-green-300 text-green-700">
            {syncResult}
          </Badge>
        )}
      </div>

      {/* AI Recommendation */}
      {(recommendation || isStreaming) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" /> AI Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{recommendation}</Markdown>
            {isStreaming && <span className="animate-pulse">▋</span>}
          </CardContent>
        </Card>
      )}

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent Activities
          </CardTitle>
          <CardDescription>{recentData?.total ?? 0} total activities</CardDescription>
        </CardHeader>
        <CardContent>
          {!recentData?.items?.length ? (
            <p className="text-sm text-muted-foreground">
              No activities yet. Connect Strava and sync to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {recentData.items.map((a) => (
                <Link
                  key={a.id}
                  href={`/activities/${a.id}`}
                  className="flex items-center justify-between py-2 border-b last:border-0 hover:bg-muted/50 -mx-4 px-4 rounded transition-colors"
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
                  <div className="text-right text-sm text-muted-foreground">
                    {a.durationSeconds && <span>{formatDuration(a.durationSeconds)}</span>}
                    {a.distanceMeters && (
                      <span className="ml-2">{formatDistance(a.distanceMeters)}</span>
                    )}
                    {a.averageHeartRate && <span className="ml-2">{a.averageHeartRate} bpm</span>}
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
