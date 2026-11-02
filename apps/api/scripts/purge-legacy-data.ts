// Deletes Strava-era data (see services/purge.ts). Run: pnpm --filter api purge-legacy-data [--yes]
import { createInterface } from "node:readline/promises"
import { count, eq } from "drizzle-orm"
import { db } from "../src/db/index.js"
import {
  activities,
  chatHistory,
  chatSessions,
  dailyRecommendations,
  weeklyReports,
} from "../src/db/schema.js"
import { purgeLegacyData } from "../src/services/purge.js"

const n = async (q: PromiseLike<{ c: number }[]>) => (await q)[0]?.c ?? 0

console.log("Will delete:")
console.log(
  `  activities (source = strava): ${await n(db.select({ c: count() }).from(activities).where(eq(activities.source, "strava")))}`
)
console.log(`  chat_history: ${await n(db.select({ c: count() }).from(chatHistory))}`)
console.log(`  chat_sessions: ${await n(db.select({ c: count() }).from(chatSessions))}`)
console.log(
  `  daily_recommendations: ${await n(db.select({ c: count() }).from(dailyRecommendations))}`
)
console.log(`  weekly_reports: ${await n(db.select({ c: count() }).from(weeklyReports))}`)
console.log("Kept: users, api_keys, user_profiles.")

if (!process.argv.includes("--yes")) {
  if (!process.stdin.isTTY) {
    console.error("Not an interactive terminal; pass --yes to confirm. Aborted.")
    process.exit(1)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  // A closed stdin (Ctrl-D) resolves as "" = not confirmed.
  const answer = await new Promise<string>((res) => {
    rl.once("close", () => res(""))
    rl.question('Type "yes" to delete: ').then(res)
  })
  rl.close()
  if (answer.trim() !== "yes") {
    console.log("Aborted.")
    process.exit(1)
  }
}

console.log("Deleted:", await purgeLegacyData(db))
process.exit(0)
