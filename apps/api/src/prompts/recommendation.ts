import { and, desc, eq, gte } from "drizzle-orm"
import type { DB } from "../db/index.js"
import { activities, chatHistory, userProfiles } from "../db/schema.js"
import { calculateTrainingLoad } from "../services/atl-ctl.js"
import { formatDistance, formatDuration, formatPace, formatProfileSection } from "./_format.js"

export async function buildRecommendationPrompt(userId: string, db: DB): Promise<string> {
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const fortyTwoDaysAgo = new Date()
  fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42)

  const [recentActivities, allActivities, recentChat, profileRows] = await Promise.all([
    db
      .select()
      .from(activities)
      .where(and(eq(activities.userId, userId), gte(activities.startDate, fourteenDaysAgo)))
      .orderBy(desc(activities.startDate))
      .limit(20),
    db
      .select()
      .from(activities)
      .where(and(eq(activities.userId, userId), gte(activities.startDate, fortyTwoDaysAgo)))
      .orderBy(desc(activities.startDate)),
    db
      .select()
      .from(chatHistory)
      .where(eq(chatHistory.userId, userId))
      .orderBy(desc(chatHistory.createdAt))
      .limit(3),
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
  ])

  const load = calculateTrainingLoad(allActivities)
  const profile = profileRows[0] ?? null

  const lines: string[] = [
    "# Athlete Training Context",
    "",
    `**Date**: ${new Date().toISOString().slice(0, 10)}`,
    "",
    ...formatProfileSection(profile),
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
