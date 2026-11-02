import { createHash } from "node:crypto"
import type { Activity, UserProfile } from "../db/schema.js"
import { computeInsightHash } from "./activity-insight.js"

/** Subset of Anthropic stream events used for the recap. */
export type RecapStreamEvent = { type: string; delta?: { type: string; text?: string } }

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
    if (event.type !== "content_block_delta" || event.delta?.type !== "text_delta") continue
    const text = event.delta.text ?? ""
    full += text
    if (clientGone) continue
    try {
      opts.onText(text)
    } catch {
      // Client disconnected: keep consuming so the recap is still saved.
      clientGone = true
    }
  }
  await opts.save(full)
  return full
}
