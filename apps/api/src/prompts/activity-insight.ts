import type { Activity, UserProfile } from "../db/schema.js"

type RawData = Record<string, unknown>

export function buildActivityInsightPrompt(
  activity: Activity,
  profile: UserProfile | null
): string {
  const raw = (activity.rawData as RawData) ?? {}

  const lines = [
    `Activity: ${activity.name ?? activity.sportType} on ${activity.startDate.toISOString().slice(0, 10)}`,
    `Type: ${activity.sportType}`,
  ]
  if (activity.durationSeconds)
    lines.push(`Duration: ${Math.round(activity.durationSeconds / 60)} min`)
  if (activity.distanceMeters)
    lines.push(`Distance: ${(activity.distanceMeters / 1000).toFixed(2)} km`)
  if (activity.elevationMeters) lines.push(`Elevation: ${Math.round(activity.elevationMeters)} m`)
  if (activity.averageHeartRate) lines.push(`Avg HR: ${activity.averageHeartRate} bpm`)
  if (activity.maxHeartRate) lines.push(`Max HR: ${activity.maxHeartRate} bpm`)
  if (activity.averagePaceSecondsPerKm) {
    const m = Math.floor(activity.averagePaceSecondsPerKm / 60)
    const s = activity.averagePaceSecondsPerKm % 60
    lines.push(`Avg Pace: ${m}:${String(s).padStart(2, "0")}/km`)
  }
  if (raw.average_watts)
    lines.push(
      `Avg Power: ${raw.average_watts} W${raw.device_watts ? " (power meter)" : " (estimated)"}`
    )
  if (raw.weighted_average_watts) lines.push(`Normalized Power: ${raw.weighted_average_watts} W`)
  if (raw.kilojoules) lines.push(`Energy: ${raw.kilojoules} kJ`)
  if (activity.calories) lines.push(`Calories: ${activity.calories} kcal`)
  if (activity.sufferScore) lines.push(`Suffer Score: ${activity.sufferScore}`)
  if (activity.perceivedExertion) lines.push(`RPE: ${activity.perceivedExertion}/10`)
  if (raw.pr_count) lines.push(`PRs: ${raw.pr_count}`)
  if (raw.trainer) lines.push("Indoor: yes")

  lines.push("")
  lines.push(`Athlete Sex: ${profile?.sex ?? "not set"}`)
  lines.push(`Athlete Weight: ${profile?.weightKg ? `${profile.weightKg} kg` : "not set"}`)
  lines.push(`Athlete Height: ${profile?.heightCm ? `${profile.heightCm} cm` : "not set"}`)
  lines.push(`Athlete Max HR: ${profile?.maxHeartRate ? `${profile.maxHeartRate} bpm` : "not set"}`)
  lines.push(`Athlete FTP: ${profile?.ftpWatts ? `${profile.ftpWatts} W` : "not set"}`)
  lines.push(`Athlete VO2Max: ${profile?.vo2max ? `${profile.vo2max} ml/kg/min` : "not set"}`)
  lines.push(`Athlete Goals: ${profile?.goals ?? "not set"}`)
  lines.push(`Athlete Preferences: ${profile?.preferences ?? "not set"}`)

  return `Analyse this training session and give concise, actionable coaching feedback (3–5 sentences). Focus on effort level, pacing, and one key takeaway.\n\n${lines.join("\n")}`
}
