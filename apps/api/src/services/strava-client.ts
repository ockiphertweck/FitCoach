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
  // Detail endpoint only:
  calories?: number
  perceived_exertion?: number
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

interface StravaStream {
  data: number[]
}

interface StravaStreamsRaw {
  heartrate?: StravaStream
  distance?: StravaStream
  velocity_smooth?: StravaStream
  altitude?: StravaStream
}

export interface StreamPoint {
  distanceKm: number
  heartrate: number | null
  speedKmh: number | null
  altitudeM: number | null
}

export interface HrZones {
  zone1: number
  zone2: number
  zone3: number
  zone4: number
  zone5: number
}

export async function getActivityStreams(
  accessToken: string,
  activityId: string,
  maxHr: number | null
): Promise<{ points: StreamPoint[]; hrZones: HrZones | null; maxHrUsed: number | null }> {
  const keys = "heartrate,velocity_smooth,altitude,distance"
  const res = await fetch(
    `${STRAVA_API}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) throw new Error(`Strava streams error: ${res.status}`)

  const raw = (await res.json()) as StravaStreamsRaw

  const distArr = raw.distance?.data ?? []
  const hrArr = raw.heartrate?.data ?? null
  const velArr = raw.velocity_smooth?.data ?? null
  const altArr = raw.altitude?.data ?? null

  if (distArr.length === 0) return { points: [], hrZones: null, maxHrUsed: null }

  // Compute HR zones from full resolution before downsampling
  let hrZones: HrZones | null = null
  let maxHrUsed: number | null = null

  if (hrArr && hrArr.length > 0) {
    const effectiveMaxHr = maxHr ?? Math.round(Math.max(...hrArr) / 0.95)
    maxHrUsed = effectiveMaxHr
    const zones: HrZones = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 }
    for (const hr of hrArr) {
      const pct = hr / effectiveMaxHr
      if (pct < 0.6) zones.zone1++
      else if (pct < 0.7) zones.zone2++
      else if (pct < 0.8) zones.zone3++
      else if (pct < 0.9) zones.zone4++
      else zones.zone5++
    }
    hrZones = zones
  }

  // Build full points array then downsample to max 500
  const full: StreamPoint[] = distArr.map((d, i) => ({
    distanceKm: Math.round(d / 10) / 100,
    heartrate: hrArr ? (hrArr[i] ?? null) : null,
    speedKmh: velArr ? (velArr[i] != null ? Math.round(velArr[i] * 3.6 * 10) / 10 : null) : null,
    altitudeM: altArr ? (altArr[i] ?? null) : null,
  }))

  const step = Math.max(1, Math.floor(full.length / 500))
  const points = full.filter((_, i) => i % step === 0)

  return { points, hrZones, maxHrUsed }
}

const SPORT_TYPE_MAP: Record<string, string> = {
  weighttraining: "workout",
  workout: "workout",
  crossfit: "crossfit",
  yoga: "yoga",
  pilates: "workout",
  hiit: "workout",
  coreandflexibility: "workout",
  elliptical: "workout",
  stairstepper: "workout",
  rowing: "workout",
  virtualrow: "workout",
  inlineskate: "other",
  iceskate: "other",
  alpineski: "other",
  backcountryski: "other",
  nordicski: "other",
  snowboard: "other",
  snowshoe: "hike",
  surfing: "other",
  windsurf: "other",
  kitesurf: "other",
  stand_up_paddling: "other",
  kayaking: "other",
  canoeing: "other",
  virtualride: "ride",
  ebikeride: "ride",
  handcycle: "ride",
  velomobile: "ride",
  virtualrun: "run",
  trailrun: "run",
  walk: "walk",
  hike: "hike",
  run: "run",
  ride: "ride",
  swim: "swim",
}

export function stravaActivityToDbFields(activity: StravaActivity, userId: string) {
  const raw = (activity.sport_type || activity.type || "other").toLowerCase().replace(/\s+/g, "")
  const sportType = SPORT_TYPE_MAP[raw] ?? raw
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
    perceivedExertion: activity.perceived_exertion ?? null,
    calories: activity.calories || null,
    rawData: activity as unknown as Record<string, unknown>,
  }
}
