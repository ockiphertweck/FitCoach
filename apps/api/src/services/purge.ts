import { eq } from "drizzle-orm"
import type { DB } from "../db/index.js"
import {
  activities,
  chatHistory,
  chatSessions,
  dailyRecommendations,
  weeklyReports,
} from "../db/schema.js"

// Wipes Strava-era data. users, api_keys and user_profiles are intentionally untouched.
export function purgeLegacyData(db: DB) {
  return db.transaction(async (tx) => {
    const acts = await tx
      .delete(activities)
      .where(eq(activities.source, "strava"))
      .returning({ id: activities.id })
    const history = await tx.delete(chatHistory).returning({ id: chatHistory.id })
    const sessions = await tx.delete(chatSessions).returning({ id: chatSessions.id })
    const recaps = await tx.delete(dailyRecommendations).returning({ id: dailyRecommendations.id })
    const reports = await tx.delete(weeklyReports).returning({ id: weeklyReports.id })
    return {
      activities: acts.length,
      chatSessions: sessions.length,
      chatHistory: history.length,
      recaps: recaps.length,
      weeklyReports: reports.length,
    }
  })
}
