import { Activity, Bike, Dumbbell, Footprints, MonitorPlay, Waves } from "lucide-react"
import Link from "next/link"

export interface ActivityItem {
  id: string
  name: string | null
  sportType: string
  startDate: string
  durationSeconds: number | null
  distanceMeters: number | null
  averageHeartRate: number | null
}

const ICONS = {
  ride: Bike,
  virtualride: MonitorPlay,
  run: Footprints,
  weighttraining: Dumbbell,
  swim: Waves,
} as const

const TINTS: Record<string, string> = {
  ride: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  run: "bg-green-500/15 text-green-600 dark:text-green-400",
  swim: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  weighttraining: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  virtualride: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")
  return `${h}:${m}`
}

export function ActivityRow({ activity: a }: Readonly<{ activity: ActivityItem }>) {
  const sport = a.sportType.toLowerCase()
  const Icon = ICONS[sport as keyof typeof ICONS] ?? Activity
  const tint = TINTS[sport] ?? "bg-muted text-muted-foreground"
  const date = new Date(a.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  return (
    <Link href={`/activities/${a.id}`} className="flex items-center gap-3 py-2.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{a.name ?? a.sportType}</span>
        <span className="block text-xs text-muted-foreground">
          {date}
          {a.distanceMeters ? ` · ${(a.distanceMeters / 1000).toFixed(1)} km` : ""}
        </span>
      </span>
      <span className="text-right">
        <span className="block font-bold tabular-nums">
          {a.durationSeconds ? formatDuration(a.durationSeconds) : "—"}
        </span>
        {a.averageHeartRate != null && (
          <span className="block text-xs text-muted-foreground">{a.averageHeartRate} bpm</span>
        )}
      </span>
    </Link>
  )
}
