"use client"

import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  Activity,
  ArrowLeft,
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
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

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
  source: string
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

interface StreamPoint {
  distanceKm: number
  heartrate: number | null
  speedKmh: number | null
  altitudeM: number | null
}

interface HrZones {
  zone1: number
  zone2: number
  zone3: number
  zone4: number
  zone5: number
}

interface StreamsData {
  points: StreamPoint[]
  hrZones: HrZones | null
  maxHrUsed: number | null
}

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
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

const ZONE_ROWS = [
  { label: "Z5", color: "#ef4444", lo: 0.9, hi: null, key: "zone5" as const },
  { label: "Z4", color: "#f97316", lo: 0.8, hi: 0.9, key: "zone4" as const },
  { label: "Z3", color: "#fbbf24", lo: 0.7, hi: 0.8, key: "zone3" as const },
  { label: "Z2", color: "#34d399", lo: 0.6, hi: 0.7, key: "zone2" as const },
  { label: "Z1", color: "#60a5fa", lo: 0, hi: 0.6, key: "zone1" as const },
]

function HrZoneChart({ zones, maxHrUsed }: { zones: HrZones; maxHrUsed: number | null }) {
  const total = zones.zone1 + zones.zone2 + zones.zone3 + zones.zone4 + zones.zone5
  if (total === 0) return null

  return (
    <div className="space-y-3 py-1">
      {ZONE_ROWS.map((zone) => {
        const secs = zones[zone.key]
        const pct = Math.round((secs / total) * 100)
        const loBpm = maxHrUsed ? Math.round(zone.lo * maxHrUsed) : null
        const hiBpm = maxHrUsed && zone.hi ? Math.round(zone.hi * maxHrUsed) - 1 : null
        const range = loBpm != null ? (zone.hi ? `${loBpm}–${hiBpm} bpm` : `> ${loBpm} bpm`) : null

        return (
          <div key={zone.label} className="flex items-center gap-3">
            <span className="w-6 text-sm font-bold shrink-0">{zone.label}</span>
            <div className="flex-1 h-6 rounded-sm overflow-hidden bg-black/5">
              <div
                className="h-full rounded-sm transition-all"
                style={{
                  width: pct > 0 ? `max(4px, ${pct}%)` : "4px",
                  backgroundColor: zone.color,
                  opacity: pct > 0 ? 0.85 : 0.25,
                }}
              />
            </div>
            <span className="w-9 text-sm font-semibold text-right shrink-0">{pct}%</span>
            {range && (
              <span className="w-28 text-xs text-muted-foreground text-right shrink-0">
                {range}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const chartTooltipStyle = { fontSize: 12, borderRadius: 8 }
const chartMargin = { top: 4, right: 20, left: 0, bottom: 0 }

export default function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: activity, isLoading } = useQuery<ActivityDetail>({
    queryKey: ["activity", id],
    queryFn: () => api.get(`/activities/${id}`),
  })

  const { data: streams } = useQuery<StreamsData>({
    queryKey: ["activity-streams", id],
    queryFn: () => api.get(`/activities/${id}/streams`),
    enabled: !!activity && activity.source === "strava",
    retry: false,
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

  // Only use Strava's own calorie value — kJ/4.184 gives wrong result (metabolic ≠ mechanical)
  const kcal = activity.calories ?? null

  const pts = streams?.points ?? []
  const hasHr = pts.some((p) => p.heartrate != null)
  const hasSpeed = pts.some((p) => p.speedKmh != null)
  const hasAlt = pts.some((p) => p.altitudeM != null)

  const maxKm = pts.length > 0 ? pts[pts.length - 1].distanceKm : 0
  const kmTicks = Array.from({ length: Math.floor(maxKm / 10) }, (_, i) => (i + 1) * 10)

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
              <Badge variant="outline" className="capitalize">
                {activity.sportType}
              </Badge>
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
          <StatCard
            icon={Timer}
            label="Moving Time"
            value={fmt(movingTime)}
            sub={stopTime ? `+${fmt(stopTime)} stopped` : undefined}
          />
        )}
        {activity.distanceMeters != null && (
          <StatCard
            icon={Activity}
            label="Distance"
            value={`${(activity.distanceMeters / 1000).toFixed(2)} km`}
          />
        )}
        {activity.elevationMeters != null && activity.elevationMeters > 0 && (
          <StatCard
            icon={Mountain}
            label="Elevation Gain"
            value={`${Math.round(activity.elevationMeters)} m`}
            sub={
              raw.elev_low != null && raw.elev_high != null
                ? `${Math.round(raw.elev_low)}–${Math.round(raw.elev_high)} m`
                : undefined
            }
          />
        )}
        {activity.averageHeartRate != null && (
          <StatCard
            icon={Heart}
            label="Avg Heart Rate"
            value={`${activity.averageHeartRate} bpm`}
            sub={activity.maxHeartRate ? `max ${activity.maxHeartRate} bpm` : undefined}
          />
        )}
        {activity.averagePaceSecondsPerKm != null && (
          <StatCard
            icon={Gauge}
            label="Avg Speed"
            value={`${(3600 / activity.averagePaceSecondsPerKm).toFixed(1)} km/h`}
            sub={
              raw.max_speed != null && raw.max_speed > 0
                ? `max ${fmtSpeed(raw.max_speed)}`
                : undefined
            }
          />
        )}
        {hasPower && (
          <StatCard
            icon={Zap}
            label="Avg Power"
            value={`${Math.round(raw.average_watts ?? 0)} W`}
            sub={raw.device_watts ? "power meter" : "estimated"}
          />
        )}
        {raw.weighted_average_watts != null && (
          <StatCard
            icon={Zap}
            label="Normalized Power"
            value={`${Math.round(raw.weighted_average_watts)} W`}
          />
        )}
        {(raw.kilojoules != null || kcal != null) && (
          <StatCard
            icon={Flame}
            label="Energy"
            value={kcal != null ? `${kcal} kcal` : `${Math.round(raw.kilojoules ?? 0)} kJ`}
            sub={
              kcal != null && raw.kilojoules != null
                ? `${Math.round(raw.kilojoules)} kJ`
                : undefined
            }
          />
        )}
        {activity.sufferScore != null && (
          <StatCard icon={Heart} label="Suffer Score" value={String(activity.sufferScore)} />
        )}
        {activity.perceivedExertion != null && (
          <StatCard icon={Gauge} label="RPE" value={`${activity.perceivedExertion} / 10`} />
        )}
      </div>

      {/* Stream charts */}
      {pts.length > 0 && (
        <div className="space-y-4">
          {/* HR over distance */}
          {hasHr && (
            <Card>
              <CardHeader className="pb-2 pt-5 px-5">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Heart Rate <span className="font-normal text-xs ml-1">bpm</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={pts} margin={chartMargin}>
                    <defs>
                      <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis
                      dataKey="distanceKm"
                      type="number"
                      domain={[0, maxKm]}
                      ticks={kmTicks}
                      tickFormatter={(v) => `${v} km`}
                      tick={{ fontSize: 11 }}
                      padding={{ left: 0, right: 0 }}
                    />
                    <YAxis tick={{ fontSize: 11 }} width={36} />
                    <Tooltip
                      formatter={(v: number) => [`${v} bpm`, "HR"]}
                      labelFormatter={(v) => `${v} km`}
                      contentStyle={chartTooltipStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="heartrate"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      fill="url(#hrGrad)"
                      dot={false}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Speed over distance */}
          {hasSpeed && (
            <Card>
              <CardHeader className="pb-2 pt-5 px-5">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Speed <span className="font-normal text-xs ml-1">km/h</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={pts} margin={chartMargin}>
                    <defs>
                      <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis
                      dataKey="distanceKm"
                      type="number"
                      domain={[0, maxKm]}
                      ticks={kmTicks}
                      tickFormatter={(v) => `${v} km`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tick={{ fontSize: 11 }} width={36} />
                    <Tooltip
                      formatter={(v: number) => [`${v} km/h`, "Speed"]}
                      labelFormatter={(v) => `${v} km`}
                      contentStyle={chartTooltipStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="speedKmh"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      fill="url(#speedGrad)"
                      dot={false}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Elevation over distance */}
          {hasAlt && (
            <Card>
              <CardHeader className="pb-2 pt-5 px-5">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Elevation <span className="font-normal text-xs ml-1">m</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={pts} margin={chartMargin}>
                    <defs>
                      <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis
                      dataKey="distanceKm"
                      type="number"
                      domain={[0, maxKm]}
                      ticks={kmTicks}
                      tickFormatter={(v) => `${v} km`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip
                      formatter={(v: number) => [`${Math.round(v)} m`, "Altitude"]}
                      labelFormatter={(v) => `${v} km`}
                      contentStyle={chartTooltipStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="altitudeM"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      fill="url(#altGrad)"
                      dot={false}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* HR zones */}
          {streams?.hrZones && (
            <Card>
              <CardHeader className="pb-2 pt-5 px-5">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Heart Rate Zones
                  {streams.maxHrUsed && (
                    <span className="ml-2 font-normal text-xs">
                      (max HR: {streams.maxHrUsed} bpm)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <HrZoneChart zones={streams.hrZones} maxHrUsed={streams.maxHrUsed} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
            {insightsMutation.isPending
              ? "Analysing…"
              : activity.aiInsight
                ? "Re-analyse"
                : "Analyse this activity"}
          </Button>
          {insightsMutation.isError && (
            <p className="text-sm text-destructive">{insightsMutation.error.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
