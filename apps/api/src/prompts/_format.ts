import type { UserProfile } from "../db/schema.js"
import type { RecapWellness } from "../services/wellness.js"

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60)
  const sec = secPerKm % 60
  return `${min}:${String(sec).padStart(2, "0")}/km`
}

export function formatFormLabel(tsb: number): string {
  if (tsb > 5) return "(fresh)"
  if (tsb < -10) return "(fatigued)"
  return "(moderate)"
}

export function formatProfileSection(profile: UserProfile | null): string[] {
  const lines = ["## Athlete Profile"]
  if (!profile) {
    lines.push("- Sex: not set")
    lines.push("- Weight: not set")
    lines.push("- Height: not set")
    lines.push("- Max Heart Rate: not set")
    lines.push("- FTP: not set")
    lines.push("- VO2Max: not set")
    lines.push("- Goals: not set")
    lines.push("- Preferences: not set")
    lines.push("")
    return lines
  }
  lines.push(`- Sex: ${profile.sex ?? "not set"}`)
  lines.push(`- Weight: ${profile.weightKg ? `${profile.weightKg} kg` : "not set"}`)
  lines.push(`- Height: ${profile.heightCm ? `${profile.heightCm} cm` : "not set"}`)
  lines.push(
    `- Max Heart Rate: ${profile.maxHeartRate ? `${profile.maxHeartRate} bpm` : "not set"}`
  )
  lines.push(`- FTP: ${profile.ftpWatts ? `${profile.ftpWatts} W` : "not set"}`)
  lines.push(`- VO2Max: ${profile.vo2max ? `${profile.vo2max} ml/kg/min` : "not set"}`)
  lines.push(`- Goals: ${profile.goals ?? "not set"}`)
  lines.push(`- Preferences: ${profile.preferences ?? "not set"}`)
  lines.push("")
  return lines
}

const val = (v: number | string | null | undefined, unit = "") =>
  v == null ? "n/a" : `${v}${unit}`

/** Markdown lines with last night's recovery (only if `date` has a row), yesterday's stress/RHR and a dated trend; [] without data. */
export function formatRecoverySection(w: RecapWellness[], date: string): string[] {
  if (w.length === 0) return []
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  const today = w.find((r) => r.date === date)
  const prev = w.find((r) => r.date === d.toISOString().slice(0, 10))
  const dur = (sec: number | null) => (sec ? formatDuration(sec) : "n/a")
  const lines = ["## Recovery (Garmin)"]
  if (today) {
    lines.push(
      `- Last night: sleep score ${val(today.sleepScore)}, ${dur(today.sleepSeconds)} (deep ${dur(today.deepSleepSeconds)}, REM ${dur(today.remSleepSeconds)}, light ${dur(today.lightSleepSeconds)}, awake ${dur(today.awakeSeconds)})`,
      `- HRV: last night ${val(today.hrvLastNight, " ms")}, weekly avg ${val(today.hrvWeeklyAvg, " ms")}, status ${val(today.hrvStatus)}`,
      `- Body Battery: ${val(today.bodyBatteryAtWake)} at wake (charged +${val(today.bodyBatteryCharged)})`
    )
  }
  if (prev) {
    lines.push(
      `- Yesterday: avg stress ${val(prev.stressAvg)}, resting HR ${val(prev.restingHeartRate, " bpm")}`
    )
  }
  lines.push(
    `- Trend (date sleep score/HRV): ${w.map((r) => `${r.date.slice(5)} ${val(r.sleepScore)}/${val(r.hrvLastNight)}`).join(", ")}`,
    ""
  )
  return lines
}
