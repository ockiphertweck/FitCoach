import type { Activity, UserProfile } from "../db/schema.js"
import { formatProfileSection } from "./_format.js"

interface WeeklyReportParams {
  weekStart: Date
  weekActivities: Activity[]
  totalDistance: number
  totalDuration: number
  avgHR: number | null
  atl: number
  ctl: number
  tsb: number
  profile: UserProfile | null
}

export function buildWeeklyReportPrompt(p: WeeklyReportParams): string {
  const profileLines = formatProfileSection(p.profile)

  const activitySummary =
    p.weekActivities.length === 0
      ? "No activities recorded."
      : p.weekActivities
          .map(
            (a) =>
              `- ${a.startDate.toISOString().slice(0, 10)}: ${a.sportType}${a.durationSeconds ? ` ${Math.round(a.durationSeconds / 60)}min` : ""}${a.distanceMeters ? ` ${(a.distanceMeters / 1000).toFixed(1)}km` : ""}${a.averageHeartRate ? ` avg HR: ${a.averageHeartRate} bpm` : ""}`
          )
          .join("\n")

  const lines = [
    `Generate a weekly training summary for the week of ${p.weekStart.toISOString().slice(0, 10)}.`,
    "",
  ]

  lines.push(...profileLines)

  lines.push(
    "Activities this week:",
    activitySummary,
    "",
    "Metrics:",
    `- Total distance: ${(p.totalDistance / 1000).toFixed(1)} km`,
    `- Total duration: ${Math.round(p.totalDuration / 60)} minutes`,
    `- Sessions: ${p.weekActivities.length}`,
    `- Avg HR: ${p.avgHR ?? "N/A"} bpm`,
    `- ATL (acute load): ${p.atl}`,
    `- CTL (chronic load): ${p.ctl}`,
    `- TSB (form): ${p.tsb}`,
    "",
    "Write a 3-4 paragraph coaching summary covering: what was accomplished, training load assessment, recovery recommendations, and focus for next week."
  )

  return lines.join("\n")
}
