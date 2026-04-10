import { createHash } from "node:crypto";
import type { Anthropic } from "@posthog/ai";
import type { Activity, UserProfile } from "../db/schema.js";
import { buildActivityInsightPrompt } from "../prompts/activity-insight.js";
import { SYSTEM_PROMPT } from "../prompts/system.js";

type RawData = Record<string, unknown>;

/**
 * Hash of the fields that drive the AI insight.
 * Volatile fields (kudos_count, achievement_count, updated_at) are excluded
 * so they don't trigger unnecessary re-generation.
 */
export function computeInsightHash(activity: Activity): string {
  const raw = (activity.rawData as RawData) ?? {};
  const payload = JSON.stringify({
    d: activity.durationSeconds,
    dist: activity.distanceMeters,
    elev: activity.elevationMeters,
    avgHr: activity.averageHeartRate,
    maxHr: activity.maxHeartRate,
    pace: activity.averagePaceSecondsPerKm,
    suffer: activity.sufferScore,
    rpe: activity.perceivedExertion,
    cal: activity.calories,
    watts: raw.average_watts ?? null,
    np: raw.weighted_average_watts ?? null,
    kj: raw.kilojoules ?? null,
    pm: raw.device_watts ?? null,
    indoor: raw.trainer ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function generateActivityInsight(
  anthropic: Anthropic,
  activity: Activity,
  profile: UserProfile | null = null,
  userId?: string,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildActivityInsightPrompt(activity, profile) },
    ],
    ...(userId && { posthogDistinctId: userId }),
  });
  return "content" in response && response.content[0]?.type === "text"
    ? response.content[0].text
    : "";
}
