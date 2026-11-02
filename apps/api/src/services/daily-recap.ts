import { createHash } from "node:crypto"
import { and, eq, gte } from "drizzle-orm"
import { z } from "zod"
import type { DB } from "../db/index.js"
import {
  type Activity,
  type DailyRecommendation,
  type UserProfile,
  activities,
  dailyRecommendations,
  userProfiles,
} from "../db/schema.js"
import { computeInsightHash } from "./activity-insight.js"

/** Subset of Anthropic stream events used for the recap. */
export type RecapStreamEvent = { type: string; delta?: unknown }

/** Hash of everything that drives the recap; a change means the stored recap is stale. */
export function computeRecapHash(input: {
  date: string
  activities: Activity[]
  profile: UserProfile | null
}): string {
  const activities = [...input.activities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => [a.id, computeInsightHash(a)])
  const profile = input.profile
    ? (({ updatedAt: _u, userId: _id, ...rest }) => rest)(input.profile)
    : null
  const payload = JSON.stringify({ date: input.date, activities, profile })
  return createHash("sha256").update(payload).digest("hex")
}

export async function streamAndSaveRecap(opts: {
  stream: AsyncIterable<RecapStreamEvent>
  onText: (text: string) => void
  save: (content: string) => Promise<void>
}): Promise<string> {
  let full = ""
  let clientGone = false
  for await (const event of opts.stream) {
    if (event.type !== "content_block_delta") continue
    const delta = event.delta as { type?: string; text?: string } | undefined
    if (delta?.type !== "text_delta") continue
    const text = delta.text ?? ""
    full += text
    if (clientGone) continue
    try {
      opts.onText(text)
    } catch {
      // Client disconnected: keep consuming so the recap is still saved.
      clientGone = true
    }
  }
  if (full.trim() !== "") await opts.save(full)
  return full
}

export const recapDateSchema = z.object({ date: z.string().date() })

/** Start (UTC midnight) of the 42-day window ending on `date`; fixed per date so the hash stays stable all day. */
export function recapWindowStart(date: string, days = 42): Date {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

/** Activities in the 42-day window plus the profile — the inputs that drive the recap. */
export async function loadRecapInputs(
  db: DB,
  userId: string,
  date: string
): Promise<{ activities: Activity[]; profile: UserProfile | null }> {
  const since = recapWindowStart(date)
  const [acts, profileRows] = await Promise.all([
    db
      .select()
      .from(activities)
      .where(and(eq(activities.userId, userId), gte(activities.startDate, since))),
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
  ])
  return { activities: acts, profile: profileRows[0] ?? null }
}

export async function getStoredRecap(
  db: DB,
  userId: string,
  date: string
): Promise<DailyRecommendation | null> {
  const [row] = await db
    .select()
    .from(dailyRecommendations)
    .where(and(eq(dailyRecommendations.userId, userId), eq(dailyRecommendations.date, date)))
    .limit(1)
  return row ?? null
}

export async function upsertRecap(
  db: DB,
  row: { userId: string; date: string; inputHash: string; content: string }
): Promise<void> {
  await db
    .insert(dailyRecommendations)
    .values(row)
    .onConflictDoUpdate({
      target: [dailyRecommendations.userId, dailyRecommendations.date],
      set: { content: row.content, inputHash: row.inputHash, generatedAt: new Date() },
    })
}
