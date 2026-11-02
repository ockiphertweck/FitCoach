"use client"

import { Card, MetricLabel } from "@/components/ui/card"
import type { Dict } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n/client"
import type { ComponentProps, ReactNode } from "react"

export interface WellnessDay {
  date: string
  sleepScore: number | null
  sleepSeconds: number | null
  deepSleepSeconds: number | null
  remSleepSeconds: number | null
  lightSleepSeconds: number | null
  awakeSeconds: number | null
  hrvLastNight: number | null
  hrvWeeklyAvg: number | null
  hrvStatus: string | null
  bodyBatteryCharged: number | null
  bodyBatteryCurrent: number | null
  stressAvg: number | null
  caloriesTotal: number | null
  caloriesActive: number | null
  caloriesResting: number | null
}
export interface WellnessData {
  today: WellnessDay | null
  days: WellnessDay[]
}

type Color = ComponentProps<typeof MetricLabel>["color"]

const hm = (s: number) => `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`
// Garmin's sleep score bands.
function sleepLabel(n: number, t: Dict): string {
  if (n >= 90) return t.home.sleepExcellent
  if (n >= 80) return t.home.sleepGood
  if (n >= 60) return t.home.sleepFair
  return t.home.sleepPoor
}
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

// No sleep score (spec Fallbacks): show duration + stages instead.
function sleepTile(w: WellnessDay | null, t: Dict) {
  const duration = w?.sleepSeconds == null ? undefined : hm(w.sleepSeconds)
  if (w?.sleepScore == null) return { value: duration ?? null, caption: t.home.duration }
  return { value: w.sleepScore, unit: sleepLabel(w.sleepScore, t), caption: duration }
}

function Tile({
  id,
  label,
  color,
  value,
  unit,
  caption,
  className,
  children,
}: Readonly<{
  id: string
  label: string
  color: Color
  value: ReactNode | null | undefined
  unit?: string
  caption?: string
  className?: string
  children?: ReactNode
}>) {
  const { t } = useI18n()
  const has = value !== null && value !== undefined
  return (
    <Card data-testid={`tile-${id}`} className={className}>
      <MetricLabel color={color}>{label}</MetricLabel>
      <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight">
        {has ? value : "—"}
        {has && unit && (
          <small className="ml-1 text-xs font-semibold text-muted-foreground">{unit}</small>
        )}
      </p>
      <p className="text-xs text-muted-foreground">{has ? caption : t.home.noData}</p>
      {has && children}
    </Card>
  )
}

function Bar({ parts }: Readonly<{ parts: { n: number; className: string }[] }>) {
  return (
    <div className="mt-2 flex h-2 overflow-hidden rounded" aria-hidden="true">
      {parts.map((p) => (
        <span key={p.className} style={{ flex: p.n }} className={p.className} />
      ))}
    </div>
  )
}

function Spark({ values, className }: Readonly<{ values: number[]; className: string }>) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${20 - ((v - min) / range) * 18}`)
    .join(" ")
  return (
    <svg
      viewBox="0 0 100 22"
      preserveAspectRatio="none"
      className={`mt-2 h-[22px] w-full ${className}`}
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function RecoveryTiles({
  data,
  loading,
  importing = false,
}: Readonly<{ data: WellnessData | undefined; loading: boolean; importing?: boolean }>) {
  const { t: dict, locale } = useI18n()
  if (loading || importing)
    return (
      <div>
        {importing && <p className="pb-2 text-sm text-muted-foreground">{dict.home.importing}</p>}
        <div
          data-testid="recovery-skeleton"
          className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))]"
        >
          {["a", "b", "c", "d", "e"].map((k) => (
            <Card key={k} className="h-[120px] animate-pulse" />
          ))}
        </div>
      </div>
    )
  const t = data?.today ?? null
  const n = (v: number) => v.toLocaleString(locale)
  const hrv = (data?.days ?? []).flatMap((d) => (d.hrvLastNight === null ? [] : [d.hrvLastNight]))
  const stages = (
    t
      ? [
          { n: t.deepSleepSeconds ?? 0, className: "bg-stage-deep" },
          { n: t.remSleepSeconds ?? 0, className: "bg-stage-rem" },
          { n: t.lightSleepSeconds ?? 0, className: "bg-stage-light" },
          { n: t.awakeSeconds ?? 0, className: "bg-stage-awake" },
        ]
      : []
  ).filter((s) => s.n > 0)
  const cal = t?.caloriesTotal
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
      <Tile id="sleep" label={dict.home.sleep} color="sleep" {...sleepTile(t, dict)}>
        {stages.length > 0 && <Bar parts={stages} />}
      </Tile>
      <Tile
        id="hrv"
        label={dict.home.hrv}
        color="hrv"
        value={t?.hrvLastNight}
        unit="ms"
        caption={[
          t?.hrvStatus &&
            ((dict.home.hrvStatus as Record<string, string>)[t.hrvStatus] ?? cap(t.hrvStatus)),
          t?.hrvWeeklyAvg != null && dict.home.sevenDayAvg(t.hrvWeeklyAvg),
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <Spark values={hrv} className="text-metric-hrv" />
      </Tile>
      <Tile
        id="battery"
        label={dict.home.bodyBattery}
        color="battery"
        value={t?.bodyBatteryCurrent}
        unit="/100"
        caption={
          t?.bodyBatteryCharged != null
            ? dict.home.chargedOvernight(t.bodyBatteryCharged)
            : dict.home.current
        }
      />
      <Tile
        id="stress"
        label={dict.home.stress}
        color="stress"
        value={t?.stressAvg}
        caption={dict.home.todaysAverage}
      />
      <Tile
        id="calories"
        label={dict.home.calories}
        color="calories"
        value={cal == null ? cal : n(cal)}
        unit="kcal"
        className="col-span-2 lg:col-span-1"
        caption={
          t?.caloriesActive != null && t.caloriesResting != null
            ? dict.home.caloriesSplit(n(t.caloriesActive), n(t.caloriesResting))
            : undefined
        }
      >
        {t?.caloriesActive != null && t.caloriesResting != null && (
          <Bar
            parts={[
              { n: t.caloriesActive, className: "bg-metric-calories" },
              { n: t.caloriesResting, className: "bg-metric-calories/30" },
            ]}
          />
        )}
      </Tile>
    </div>
  )
}
