import { and, eq } from "drizzle-orm"
import type { DB } from "../../db/index.js"
import { apiKeys } from "../../db/schema.js"
import { decrypt } from "../encryption.js"
import { createGarminClient } from "./client.js"

export type GarminClient = ReturnType<typeof createGarminClient>

/** Client for the user's stored Garmin key; null when not connected. */
export async function loadGarminClient(db: DB, userId: string): Promise<GarminClient | null> {
  const [keyRow] = await db
    .select({ encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "garmin")))
  return keyRow ? createGarminClient(decrypt(keyRow.encryptedKey)) : null
}
