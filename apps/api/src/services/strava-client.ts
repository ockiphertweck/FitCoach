import { eq } from "drizzle-orm"
import type { DB } from "../db/index.js"
import { stravaTokens } from "../db/schema.js"
import { env } from "../env.js"
import { decrypt, encrypt } from "./encryption.js"

const STRAVA_API = "https://www.strava.com/api/v3"

export interface StravaActivity {
  id: number
  name: string
  type: string
  sport_type: string
  start_date: string
  elapsed_time: number
  distance: number
  total_elevation_gain: number
  average_heartrate?: number
  max_heartrate?: number
  average_speed?: number
  suffer_score?: number
  kilojoules?: number
  calories?: number
}

async function ensureFreshToken(userId: string, db: DB): Promise<string> {
  const [token] = await db
    .select()
    .from(stravaTokens)
    .where(eq(stravaTokens.userId, userId))
    .limit(1)

  if (!token) throw new Error("No Strava token found for user")

  const now = new Date()
  // Refresh if expiring within 5 minutes
  if (token.expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const decryptedRefresh = decrypt(token.refreshToken)
    const refreshed = await refreshAccessToken(decryptedRefresh)

    await db
      .update(stravaTokens)
      .set({
        accessToken: encrypt(refreshed.accessToken),
        expiresAt: new Date(refreshed.expiresAt * 1000),
        updatedAt: new Date(),
      })
      .where(eq(stravaTokens.userId, userId))

    return refreshed.accessToken
  }

  return decrypt(token.accessToken)
}

export async function getActivities(accessToken: string, after: number): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    after: String(after),
    per_page: "200",
  })

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Strava API error: ${res.status} ${await res.text()}`)
  }

  return res.json() as Promise<StravaActivity[]>
}

export async function getActivity(accessToken: string, id: string): Promise<StravaActivity> {
  const res = await fetch(`${STRAVA_API}/activities/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Strava API error: ${res.status} ${await res.text()}`)
  }

  return res.json() as Promise<StravaActivity>
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`)
  }

  const data = (await res.json()) as { access_token: string; expires_at: number }
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_at,
  }
}

export async function getFreshAccessToken(userId: string, db: DB): Promise<string> {
  return ensureFreshToken(userId, db)
}

export function stravaActivityToDbFields(activity: StravaActivity, userId: string) {
  const sportType = (activity.sport_type || activity.type || "other").toLowerCase()
  const distanceMeters = activity.distance || null
  const avgPace =
    activity.average_speed && activity.average_speed > 0
      ? Math.round(1000 / activity.average_speed)
      : null

  return {
    userId,
    externalId: String(activity.id),
    source: "strava" as const,
    name: activity.name || null,
    sportType,
    startDate: new Date(activity.start_date),
    durationSeconds: activity.elapsed_time || null,
    distanceMeters: distanceMeters ? Number(distanceMeters) : null,
    elevationMeters: activity.total_elevation_gain || null,
    averageHeartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
    averagePaceSecondsPerKm: avgPace,
    sufferScore: activity.suffer_score || null,
    perceivedExertion: null,
    calories: activity.calories || null,
    rawData: activity as unknown as Record<string, unknown>,
  }
}
