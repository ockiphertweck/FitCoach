"use client"

import { Markdown } from "@/components/markdown"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, MetricLabel } from "@/components/ui/card"
import { api } from "@/lib/api"
import { translateApiError } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/client"
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
  polyline: string | null
}

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const dec = (v: number, locale: string, digits: number) =>
  v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })

function fmtSpeed(ms: number, locale: string) {
  return `${dec(ms * 3.6, locale, 1)} km/h`
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
    <Card className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
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
            <div className="flex-1 h-6 rounded-sm overflow-hidden bg-muted">
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

const chartTooltipStyle = {
  background: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
}
const tick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" }
const grid = { stroke: "hsl(var(--border))", strokeDasharray: "3 3", vertical: false } as const
const chartMargin = { top: 4, right: 20, left: 0, bottom: 0 }

export default function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, lang, locale } = useI18n()
  const a = t.activities

  const { data: activity, isLoading } = useQuery<ActivityDetail>({
    queryKey: ["activity", id],
    queryFn: () => api.get(`/activities/${id}`),
  })

  const { data: streams } = useQuery<StreamsData>({
    queryKey: ["activity-streams", id],
    queryFn: () => api.get(`/activities/${id}/streams`),
    enabled: !!activity,
    retry: false,
  })

  const insightsMutation = useMutation({
    mutationFn: () =>
      api.post<{ insight: string }>("/ai/activity-insight", { activityId: id, lang }),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-[20px]" />
        ))}
      </div>
    )
  }

  if (!activity) return null

  const sportName = t.sports[activity.sportType] ?? activity.sportType
  const raw = activity.rawData ?? {}
  const polyline = streams?.polyline
  const movingTime = raw.moving_time
  const elapsedTime = raw.elapsed_time ?? activity.durationSeconds
  const stopTime = movingTime && elapsedTime ? elapsedTime - movingTime : null
  const hasPower = raw.average_watts != null
  const isIndoor = raw.trainer === true

  // Only use the stored calorie value — kJ/4.184 gives wrong result (metabolic ≠ mechanical)
  const kcal = activity.calories ?? null

  const pts = streams?.points ?? []
  const hasHr = pts.some((p) => p.heartrate != null)
  const hasSpeed = pts.some((p) => p.speedKmh != null)
  const hasAlt = pts.some((p) => p.altitudeM != null)

  const maxKm = pts.length > 0 ? pts[pts.length - 1].distanceKm : 0
  const kmTicks = Array.from({ length: Math.floor(maxKm / 10) }, (_, i) => (i + 1) * 10)

  return (
    <div className="space-y-6">
      <Link
        href="/activities"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> {a.back}
      </Link>
      <PageHeader
        title={activity.name ?? sportName}
        subtitle={new Date(activity.startDate).toLocaleDateString(locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      />
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="capitalize">
          {sportName}
        </Badge>
        {isIndoor && <Badge variant="secondary">{a.indoor}</Badge>}
        {raw.commute && <Badge variant="secondary">{a.commute}</Badge>}
        {raw.pr_count != null && raw.pr_count > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            <Trophy className="h-4 w-4 text-yellow-500" /> {raw.pr_count} PR
          </span>
        )}
        {raw.achievement_count != null && raw.achievement_count > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            <Activity className="h-4 w-4 text-blue-500" /> {raw.achievement_count}
          </span>
        )}
        {raw.device_name && (
          <span className="text-xs text-muted-foreground">
            {a.via} {raw.device_name}
          </span>
        )}
      </div>

      {/* Key stats grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {movingTime != null && (
          <StatCard
            icon={Timer}
            label={a.movingTime}
            value={fmt(movingTime)}
            sub={stopTime ? `+${fmt(stopTime)} ${a.stopped}` : undefined}
          />
        )}
        {activity.distanceMeters != null && (
          <StatCard
            icon={Activity}
            label={a.distance}
            value={`${dec(activity.distanceMeters / 1000, locale, 2)} km`}
          />
        )}
        {activity.elevationMeters != null && activity.elevationMeters > 0 && (
          <StatCard
            icon={Mountain}
            label={a.elevationGain}
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
            label={a.avgHeartRate}
            value={`${activity.averageHeartRate} bpm`}
            sub={activity.maxHeartRate ? `${a.max} ${activity.maxHeartRate} bpm` : undefined}
          />
        )}
        {activity.averagePaceSecondsPerKm != null && (
          <StatCard
            icon={Gauge}
            label={a.avgSpeed}
            value={`${dec(3600 / activity.averagePaceSecondsPerKm, locale, 1)} km/h`}
            sub={
              raw.max_speed != null && raw.max_speed > 0
                ? `${a.max} ${fmtSpeed(raw.max_speed, locale)}`
                : undefined
            }
          />
        )}
        {hasPower && (
          <StatCard
            icon={Zap}
            label={a.avgPower}
            value={`${Math.round(raw.average_watts ?? 0)} W`}
            sub={raw.device_watts ? a.powerMeter : a.estimated}
          />
        )}
        {raw.weighted_average_watts != null && (
          <StatCard
            icon={Zap}
            label={a.normalizedPower}
            value={`${Math.round(raw.weighted_average_watts)} W`}
          />
        )}
        {(raw.kilojoules != null || kcal != null) && (
          <StatCard
            icon={Flame}
            label={a.energy}
            value={kcal != null ? `${kcal} kcal` : `${Math.round(raw.kilojoules ?? 0)} kJ`}
            sub={
              kcal != null && raw.kilojoules != null
                ? `${Math.round(raw.kilojoules)} kJ`
                : undefined
            }
          />
        )}
        {activity.sufferScore != null && (
          <StatCard icon={Heart} label={a.sufferScore} value={String(activity.sufferScore)} />
        )}
        {activity.perceivedExertion != null && (
          <StatCard icon={Gauge} label={a.rpe} value={`${activity.perceivedExertion} / 10`} />
        )}
      </div>

      <div className="grid gap-3 empty:hidden lg:grid-cols-2">
        {/* Map */}
        {polyline && <ActivityMap polyline={polyline} />}

        {/* Stream charts */}
        {pts.length > 0 && (
          <div className="space-y-3 lg:space-y-0 lg:contents">
            {/* HR over distance */}
            {hasHr && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {a.heartRate} <span className="font-normal text-xs ml-1">bpm</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={pts} margin={chartMargin}>
                      <defs>
                        <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-hr))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--chart-hr))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...grid} />
                      <XAxis
                        axisLine={false}
                        tickLine={false}
                        dataKey="distanceKm"
                        type="number"
                        domain={[0, maxKm]}
                        ticks={kmTicks}
                        tickFormatter={(v) => `${v} km`}
                        tick={tick}
                        padding={{ left: 0, right: 0 }}
                      />
                      <YAxis tick={tick} width={36} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => [`${v} bpm`, a.hr]}
                        labelFormatter={(v) => `${v} km`}
                        contentStyle={chartTooltipStyle}
                      />
                      <Area
                        type="monotone"
                        dataKey="heartrate"
                        stroke="hsl(var(--chart-hr))"
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
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {a.speed} <span className="font-normal text-xs ml-1">km/h</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={pts} margin={chartMargin}>
                      <defs>
                        <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor="hsl(var(--chart-duration))"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="hsl(var(--chart-duration))"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...grid} />
                      <XAxis
                        axisLine={false}
                        tickLine={false}
                        dataKey="distanceKm"
                        type="number"
                        domain={[0, maxKm]}
                        ticks={kmTicks}
                        tickFormatter={(v) => `${v} km`}
                        tick={tick}
                      />
                      <YAxis tick={tick} width={36} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => [`${v} km/h`, a.speed]}
                        labelFormatter={(v) => `${v} km`}
                        contentStyle={chartTooltipStyle}
                      />
                      <Area
                        type="monotone"
                        dataKey="speedKmh"
                        stroke="hsl(var(--chart-duration))"
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
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {a.elevation} <span className="font-normal text-xs ml-1">m</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={pts} margin={chartMargin}>
                      <defs>
                        <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor="hsl(var(--chart-distance))"
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor="hsl(var(--chart-distance))"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...grid} />
                      <XAxis
                        axisLine={false}
                        tickLine={false}
                        dataKey="distanceKm"
                        type="number"
                        domain={[0, maxKm]}
                        ticks={kmTicks}
                        tickFormatter={(v) => `${v} km`}
                        tick={tick}
                      />
                      <YAxis tick={tick} width={40} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => [`${Math.round(v)} m`, a.altitude]}
                        labelFormatter={(v) => `${v} km`}
                        contentStyle={chartTooltipStyle}
                      />
                      <Area
                        type="monotone"
                        dataKey="altitudeM"
                        stroke="hsl(var(--chart-distance))"
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
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {a.heartRateZones}
                    {streams.maxHrUsed && (
                      <span className="ml-2 font-normal text-xs">
                        ({a.maxHrUsed}: {streams.maxHrUsed} bpm)
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <HrZoneChart zones={streams.hrZones} maxHrUsed={streams.maxHrUsed} />
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* AI Insight */}
      <Card>
        <CardHeader>
          <MetricLabel color="coach">{a.aiInsight}</MetricLabel>
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
              ? a.analysing
              : activity.aiInsight
                ? a.reanalyse
                : a.analyse}
          </Button>
          {insightsMutation.isError && (
            <p className="text-sm text-destructive">
              {translateApiError(insightsMutation.error.message, t)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
