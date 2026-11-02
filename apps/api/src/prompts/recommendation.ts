import { desc, eq } from "drizzle-orm"
import type { DB } from "../db/index.js"
import { chatHistory } from "../db/schema.js"
import { calculateTrainingLoad } from "../services/atl-ctl.js"
import { loadRecapInputs, recapWindowStart } from "../services/daily-recap.js"
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatProfileSection,
  formatRecoverySection,
} from "./_format.js"
import { RECAP_SYSTEM_PROMPT } from "./recap-system.js"

/** Request params for the short daily recap (the route adds stream + distinct id). */
export function buildRecapRequest(userMessage: string) {
  return {
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: RECAP_SYSTEM_PROMPT,
    messages: [{ role: "user" as const, content: userMessage }],
  }
}

export async function buildRecommendationPrompt(
  userId: string,
  db: DB,
  date: string
): Promise<string> {
  const fourteenDaysAgo = recapWindowStart(date, 14)

  const [{ activities: allActivities, profile, wellness }, recentChat] = await Promise.all([
    loadRecapInputs(db, userId, date),
    db
      .select()
      .from(chatHistory)
      .where(eq(chatHistory.userId, userId))
      .orderBy(desc(chatHistory.createdAt))
      .limit(3),
  ])
  const recentActivities = allActivities
    .filter((a) => a.startDate >= fourteenDaysAgo)
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .slice(0, 20)

  const load = calculateTrainingLoad(allActivities)

  const lines: string[] = [
    "# Athlete Training Context",
    "",
    `**Date**: ${date}`,
    "",
    ...formatProfileSection(profile),
    ...formatRecoverySection(wellness),
    "## Training Load (TRIMP-based)",
    `- ATL (Acute / 7-day): ${load.atl}`,
    `- CTL (Chronic / 42-day): ${load.ctl}`,
    `- TSB (Form = CTL - ATL): ${load.tsb} ${load.tsb > 5 ? "(fresh)" : load.tsb < -10 ? "(fatigued)" : "(moderate)"}`,
    "",
    "## Last 14 Days Activities",
  ]

  if (recentActivities.length === 0) {
    lines.push("No activities recorded in the last 14 days.")
  } else {
    for (const a of recentActivities) {
      const parts = [`- ${a.startDate.toISOString().slice(0, 10)} | ${a.sportType}`]
      if (a.name) parts.push(`"${a.name}"`)
      if (a.durationSeconds) parts.push(formatDuration(a.durationSeconds))
      if (a.distanceMeters) parts.push(formatDistance(a.distanceMeters))
      if (a.averageHeartRate) parts.push(`avg HR: ${a.averageHeartRate} bpm`)
      if (a.averagePaceSecondsPerKm) parts.push(formatPace(a.averagePaceSecondsPerKm))
      if (a.perceivedExertion) parts.push(`RPE: ${a.perceivedExertion}/10`)
      lines.push(parts.join(" | "))
    }
  }

  if (recentChat.length > 0) {
    lines.push("", "## Recent Coaching Chat (last 3 messages)")
    for (const msg of [...recentChat].reverse()) {
      lines.push(`**${msg.role}**: ${msg.content.slice(0, 200)}`)
    }
  }

  lines.push(
    "",
    "Based on my current training load and recent activities, what should I do today? Should I train or rest? If train, what type of workout?"
  )

  // Rough token cap: ~4 chars per token, cap at ~3000 tokens = 12000 chars
  return lines.join("\n").slice(0, 12000)
}
