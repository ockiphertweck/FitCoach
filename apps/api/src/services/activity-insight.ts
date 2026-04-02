import { createHash } from "node:crypto"
import type Anthropic from "@anthropic-ai/sdk"
import type { Activity } from "../db/schema.js"
import { SYSTEM_PROMPT } from "./ai-context.js"

type RawData = Record<string, unknown>

/**
 * Hash of the fields that drive the AI insight.
 * Volatile fields (kudos_count, achievement_count, updated_at) are excluded
 * so they don't trigger unnecessary re-generation.
 */
export function computeInsightHash(activity: Activity): string {
  const raw = (activity.rawData as RawData) ?? {}
  const payload = JSON.stringify({
    d: activity.durationSeconds,
    dist: activity.distanceMeters,
    elev: activity.elevationMeters,
    avgHr: activity.averageHeartRate,
    maxHr: activity.maxHeartRate,
    pace: activity.averagePaceSecondsPerKm,
    suffer: activity.sufferScore,
    rpe: activity.perceivedExertion,
    cal: activity.calories,
    watts: raw.average_watts ?? null,
    np: raw.weighted_average_watts ?? null,
    kj: raw.kilojoules ?? null,
    pm: raw.device_watts ?? null,
    indoor: raw.trainer ?? null,
  })
  return createHash("sha256").update(payload).digest("hex")
}

export function buildInsightLines(activity: Activity): string[] {
  const raw = (activity.rawData as RawData) ?? {}
  const lines = [
    `Activity: ${activity.name ?? activity.sportType} on ${activity.startDate.toISOString().slice(0, 10)}`,
    `Type: ${activity.sportType}`,
  ]
  if (activity.durationSeconds) lines.push(`Duration: ${Math.round(activity.durationSeconds / 60)} min`)
  if (activity.distanceMeters) lines.push(`Distance: ${(activity.distanceMeters / 1000).toFixed(2)} km`)
  if (activity.elevationMeters) lines.push(`Elevation: ${Math.round(activity.elevationMeters)} m`)
  if (activity.averageHeartRate) lines.push(`Avg HR: ${activity.averageHeartRate} bpm`)
  if (activity.maxHeartRate) lines.push(`Max HR: ${activity.maxHeartRate} bpm`)
  if (activity.averagePaceSecondsPerKm) {
    const m = Math.floor(activity.averagePaceSecondsPerKm / 60)
    const s = activity.averagePaceSecondsPerKm % 60
    lines.push(`Avg Pace: ${m}:${String(s).padStart(2, "0")}/km`)
  }
  if (raw.average_watts) lines.push(`Avg Power: ${raw.average_watts} W${raw.device_watts ? " (power meter)" : " (estimated)"}`)
  if (raw.weighted_average_watts) lines.push(`Normalized Power: ${raw.weighted_average_watts} W`)
  if (raw.kilojoules) lines.push(`Energy: ${raw.kilojoules} kJ`)
  if (activity.calories) lines.push(`Calories: ${activity.calories} kcal`)
  if (activity.sufferScore) lines.push(`Suffer Score: ${activity.sufferScore}`)
  if (activity.perceivedExertion) lines.push(`RPE: ${activity.perceivedExertion}/10`)
  if (raw.pr_count) lines.push(`PRs: ${raw.pr_count}`)
  if (raw.trainer) lines.push(`Indoor: yes`)
  return lines
}

export async function generateActivityInsight(anthropic: Anthropic, activity: Activity): Promise<string> {
  const lines = buildInsightLines(activity)
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Analyse this training session and give concise, actionable coaching feedback (3–5 sentences). Focus on effort level, pacing, and one key takeaway.\n\n${lines.join("\n")}`,
    }],
  })
  return response.content[0]?.type === "text" ? response.content[0].text : ""
}
