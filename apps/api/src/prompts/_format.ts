import type { UserProfile } from "../db/schema.js"

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
