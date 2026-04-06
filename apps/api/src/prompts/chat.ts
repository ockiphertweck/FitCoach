import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.js"
import { and, desc, eq, gte } from "drizzle-orm"
import type { DB } from "../db/index.js"
import { activities, userProfiles } from "../db/schema.js"
import { calculateTrainingLoad } from "../services/atl-ctl.js"
import { formatDistance, formatDuration, formatProfileSection } from "./_format.js"
import { SYSTEM_PROMPT } from "./system.js"

/**
 * Builds the system prompt for a chat turn, including the athlete's profile and
 * recent training load so Claude always has full context even mid-conversation.
 */
export async function buildChatSystemPrompt(userId: string, db: DB): Promise<string> {
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const fortyTwoDaysAgo = new Date()
  fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42)

  const [recentActivities, allActivities, profileRows] = await Promise.all([
    db
      .select()
      .from(activities)
      .where(and(eq(activities.userId, userId), gte(activities.startDate, fourteenDaysAgo)))
      .orderBy(desc(activities.startDate))
      .limit(10),
    db
      .select()
      .from(activities)
      .where(and(eq(activities.userId, userId), gte(activities.startDate, fortyTwoDaysAgo)))
      .orderBy(desc(activities.startDate)),
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
  ])

  const load = calculateTrainingLoad(allActivities)
  const profile = profileRows[0] ?? null

  const contextLines: string[] = [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    "",
    ...formatProfileSection(profile),
    "## Current Training Load",
    `- ATL: ${load.atl} | CTL: ${load.ctl} | TSB: ${load.tsb} ${load.tsb > 5 ? "(fresh)" : load.tsb < -10 ? "(fatigued)" : "(moderate)"}`,
    "",
    "## Recent Activities (last 14 days)",
  ]

  if (recentActivities.length === 0) {
    contextLines.push("No activities recorded.")
  } else {
    for (const a of recentActivities) {
      const parts = [`- ${a.startDate.toISOString().slice(0, 10)} ${a.sportType}`]
      if (a.durationSeconds) parts.push(formatDuration(a.durationSeconds))
      if (a.distanceMeters) parts.push(formatDistance(a.distanceMeters))
      if (a.averageHeartRate) parts.push(`${a.averageHeartRate} bpm`)
      contextLines.push(parts.join(" "))
    }
  }

  return `${SYSTEM_PROMPT}\n\n---\n\n${contextLines.join("\n")}`
}

export function buildChatMessages(
  history: Array<{ role: string; content: string }>
): MessageParam[] {
  return history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }))
}
