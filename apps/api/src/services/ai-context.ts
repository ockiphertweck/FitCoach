import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js"
import { and, desc, eq, gte } from "drizzle-orm"
import type { DB } from "../db/index.js"
import { activities, chatHistory } from "../db/schema.js"
import { calculateTrainingLoad } from "./atl-ctl.js"

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`
}

function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60)
  const sec = secPerKm % 60
  return `${min}:${String(sec).padStart(2, "0")}/km`
}

export async function buildRecommendationContext(userId: string, db: DB): Promise<string> {
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const fortyTwoDaysAgo = new Date()
  fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42)

  const [recentActivities, allActivities, recentChat] = await Promise.all([
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
  ])

  const load = calculateTrainingLoad(allActivities)

  const lines: string[] = [
    "# Athlete Training Context",
    "",
    `**Date**: ${new Date().toISOString().slice(0, 10)}`,
    "",
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

  const context = lines.join("\n")
  // Rough token cap: ~4 chars per token, cap at ~3000 tokens = 12000 chars
  return context.slice(0, 12000)
}

export async function buildChatContext(
  userId: string,
  history: Array<{ role: string; content: string }>,
  db: DB
): Promise<MessageParam[]> {
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const recentActivities = await db
    .select()
    .from(activities)
    .where(gte(activities.startDate, fourteenDaysAgo))
    .orderBy(desc(activities.startDate))
    .limit(10)

  const activitySummary =
    recentActivities.length === 0
      ? "No recent activities."
      : recentActivities
          .map((a) => {
            const parts = [`${a.startDate.toISOString().slice(0, 10)} ${a.sportType}`]
            if (a.durationSeconds) parts.push(formatDuration(a.durationSeconds))
            if (a.distanceMeters) parts.push(formatDistance(a.distanceMeters))
            if (a.averageHeartRate) parts.push(`${a.averageHeartRate}bpm`)
            return parts.join(" ")
          })
          .join(", ")

  const messages: MessageParam[] = []

  // Inject system context as a user turn (Claude API doesn't have system in messages array)
  if (history.length === 0) {
    messages.push({
      role: "user",
      content: `[Context: Recent activities: ${activitySummary}]\n\n${history[0]?.content ?? ""}`,
    })
  } else {
    for (const msg of history) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })
    }
  }

  return messages
}

export const SYSTEM_PROMPT = `You are FitCoach, an expert AI endurance training coach with deep knowledge of running, cycling, swimming, and strength training. You help athletes optimize their training load, recovery, and performance.

You analyze training data including ATL (acute training load), CTL (chronic training load), and TSB (training stress balance = form). You provide evidence-based recommendations following principles from periodization science.

Guidelines:
- Be concise and actionable. Lead with the recommendation.
- Use training science terminology but explain it clearly.
- Consider the athlete's current fatigue (ATL), fitness (CTL), and form (TSB).
- Positive TSB = fresh/recovered. Negative TSB = fatigued/building fitness.
- Flag potential overtraining if TSB drops below -20 or ATL spikes sharply.
- Ask about goals, upcoming races, or constraints when relevant.
- Always prioritize recovery and injury prevention.`
