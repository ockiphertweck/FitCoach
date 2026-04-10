import { Anthropic } from "@posthog/ai";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { env } from "../env.js";
import { decrypt } from "./encryption.js";
import { posthog } from "./posthog.js";

/** Returns an Anthropic client for the user, or null if no key is configured. */
export async function getAnthropicClient(
  userId: string,
): Promise<Anthropic | null> {
  const [keyRow] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "anthropic")))
    .limit(1);

  const apiKey = keyRow ? decrypt(keyRow.encryptedKey) : env.CLAUDE_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, posthog });
}

/** Like getAnthropicClient, but throws if no key is configured. */
export async function requireAnthropicClient(
  userId: string,
): Promise<Anthropic> {
  const client = await getAnthropicClient(userId);
  if (!client)
    throw new Error("No Claude API key configured. Add one in Settings.");
  return client;
}
