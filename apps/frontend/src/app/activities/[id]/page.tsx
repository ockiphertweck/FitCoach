"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Activity,
  ArrowLeft,
  Bike,
  Flame,
  Gauge,
  Heart,
  Mountain,
  Timer,
  Trophy,
  Zap,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { use } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Markdown } from "@/components/markdown"
import { api } from "@/lib/api"

const ActivityMap = dynamic(() => import("@/components/activity-map"), { ssr: false })

interface RawData {
  moving_time?: number
  elapsed_time?: number
  average_watts?: number
  max_watts?: number
  weighted_average_watts?: number
  kilojoules?: number
  device_watts?: boolean
  max_speed?: number
  pr_count?: number
  achievement_count?: number
  kudos_count?: number
  trainer?: boolean
  commute?: boolean
  device_name?: string
  gear_id?: string
  elev_low?: number
  elev_high?: number
  start_latlng?: [number, number]
  end_latlng?: [number, number]
  map?: { summary_polyline?: string }
  workout_type?: number
  suffer_score?: number
}

interface ActivityDetail {
  id: string
  name: string | null
  sportType: string
  startDate: string
  durationSeconds: number | null
  distanceMeters: number | null
  elevationMeters: number | null
  averageHeartRate: number | null
  maxHeartRate: number | null
  averagePaceSecondsPerKm: number | null
  sufferScore: number | null
  perceivedExertion: number | null
  calories: number | null
  rawData: RawData | null
  aiInsight: string | null
}

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtPace(secPerKm: number) {
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${String(s).padStart(2, "0")}/km`
}

function fmtSpeed(ms: number) {
  return `${(ms * 3.6).toFixed(1)} km/h`
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-sm">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

export default function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: activity, isLoading } = useQuery<ActivityDetail>({
    queryKey: ["activity", id],
    queryFn: () => api.get(`/activities/${id}`),
  })

  const insightsMutation = useMutation({
    mutationFn: () => api.post<{ insight: string }>("/ai/activity-insight", { activityId: id }),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (!activity) return null

  const raw = activity.rawData ?? {}
  const polyline = raw.map?.summary_polyline
  const movingTime = raw.moving_time
  const elapsedTime = raw.elapsed_time ?? activity.durationSeconds
  const stopTime = movingTime && elapsedTime ? elapsedTime - movingTime : null
  const hasPower = raw.average_watts != null
  const isIndoor = raw.trainer === true

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back + header */}
      <div>
        <Link
          href="/activities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> Activities
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{activity.name ?? activity.sportType}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="capitalize">{activity.sportType}</Badge>
              {isIndoor && <Badge variant="secondary">Indoor</Badge>}
              {raw.commute && <Badge variant="secondary">Commute</Badge>}
              <span className="text-sm text-muted-foreground">
                {new Date(activity.startDate).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            {raw.device_name && (
              <p className="text-xs text-muted-foreground mt-1">via {raw.device_name}</p>
            )}
          </div>
          <div className="flex gap-3 shrink-0 text-center">
            {raw.pr_count != null && raw.pr_count > 0 && (
              <div className="flex flex-col items-center">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <span className="text-xs font-medium">{raw.pr_count} PR</span>
              </div>
            )}
            {raw.achievement_count != null && raw.achievement_count > 0 && (
              <div className="flex flex-col items-center">
                <Activity className="h-5 w-5 text-blue-500" />
                <span className="text-xs font-medium">{raw.achievement_count}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      {polyline && (
        <Card className="overflow-hidden">
          <ActivityMap polyline={polyline} />
        </Card>
      )}

      {/* Key stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {movingTime != null && (
          <StatCard icon={Timer} label="Moving Time" value={fmt(movingTime)}
            sub={stopTime ? `+${fmt(stopTime)} stopped` : undefined} />
        )}
        {activity.distanceMeters != null && (
          <StatCard icon={Activity} label="Distance"
            value={`${(activity.distanceMeters / 1000).toFixed(2)} km`} />
        )}
        {activity.elevationMeters != null && activity.elevationMeters > 0 && (
          <StatCard icon={Mountain} label="Elevation Gain"
            value={`${Math.round(activity.elevationMeters)} m`}
            sub={raw.elev_low != null && raw.elev_high != null
              ? `${Math.round(raw.elev_low)}–${Math.round(raw.elev_high)} m`
              : undefined} />
        )}
        {activity.averageHeartRate != null && (
          <StatCard icon={Heart} label="Avg Heart Rate"
            value={`${activity.averageHeartRate} bpm`}
            sub={activity.maxHeartRate ? `max ${activity.maxHeartRate} bpm` : undefined} />
        )}
        {activity.averagePaceSecondsPerKm != null && (
          <StatCard icon={Gauge} label="Avg Pace"
            value={fmtPace(activity.averagePaceSecondsPerKm)} />
        )}
        {raw.max_speed != null && raw.max_speed > 0 && (
          <StatCard icon={Gauge} label="Max Speed" value={fmtSpeed(raw.max_speed)} />
        )}
        {hasPower && (
          <StatCard icon={Zap} label="Avg Power"
            value={`${Math.round(raw.average_watts!)} W`}
            sub={raw.device_watts ? "power meter" : "estimated"} />
        )}
        {raw.weighted_average_watts != null && (
          <StatCard icon={Zap} label="Normalized Power"
            value={`${Math.round(raw.weighted_average_watts)} W`} />
        )}
        {raw.kilojoules != null && (
          <StatCard icon={Bike} label="Energy" value={`${Math.round(raw.kilojoules)} kJ`} />
        )}
        {activity.calories != null && (
          <StatCard icon={Flame} label="Calories" value={`${activity.calories} kcal`} />
        )}
        {activity.sufferScore != null && (
          <StatCard icon={Heart} label="Suffer Score" value={String(activity.sufferScore)} />
        )}
        {activity.perceivedExertion != null && (
          <StatCard icon={Gauge} label="RPE" value={`${activity.perceivedExertion} / 10`} />
        )}
      </div>

      {/* AI Insight */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" /> AI Insight
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {insightsMutation.data ? (
            <Markdown>{insightsMutation.data.insight}</Markdown>
          ) : activity.aiInsight ? (
            <Markdown>{activity.aiInsight}</Markdown>
          ) : null}
          <Button
            onClick={() => insightsMutation.mutate()}
            disabled={insightsMutation.isPending}
            variant="outline"
            size="sm"
          >
            {insightsMutation.isPending ? "Analysing…" : activity.aiInsight ? "Re-analyse" : "Analyse this activity"}
          </Button>
          {insightsMutation.isError && (
            <p className="text-sm text-destructive">{insightsMutation.error.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
