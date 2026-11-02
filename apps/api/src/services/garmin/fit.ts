import { Decoder, Stream } from "@garmin/fitsdk"
import polyline from "@mapbox/polyline"
import { eq } from "drizzle-orm"
import { unzipSync } from "fflate"
import type { DB } from "../../db/index.js"
import { type Activity, activities } from "../../db/schema.js"
import { type HrZones, type StreamPoint, buildStreams } from "../streams.js"
import { GarminError } from "./client.js"
import { loadGarminClient } from "./load-client.js"

export interface FitStreams {
  points: StreamPoint[]
  hrZones: HrZones | null
  maxHrUsed: number | null
  polyline: string | null
}

const EMPTY: FitStreams = { points: [], hrZones: null, maxHrUsed: null, polyline: null }
const MAX_COORDS = 1000
const DEG = 180 / 2 ** 31 // semicircles -> degrees

type Rec = {
  distance?: number
  heartRate?: number
  enhancedSpeed?: number
  enhancedAltitude?: number
  positionLat?: number
  positionLong?: number
}

const col = (recs: Rec[], pick: (r: Rec) => number | undefined): number[] | null => {
  const v = recs.map(pick)
  return v.every((x) => typeof x === "number") ? (v as number[]) : null
}

/** Never throws: any malformed input yields an empty result. */
export function parseFitActivity(zip: Uint8Array, maxHr: number | null): FitStreams {
  try {
    const entry = Object.entries(unzipSync(zip)).find(([n]) => n.toLowerCase().endsWith(".fit"))
    if (!entry) return EMPTY
    const { messages } = new Decoder(Stream.fromByteArray(Array.from(entry[1]))).read()
    const recs = ((messages.recordMesgs ?? []) as Rec[]).filter((r) => r.distance != null)
    if (recs.length === 0) return EMPTY

    const streams = buildStreams(
      {
        distanceM: recs.map((r) => r.distance as number),
        heartrate: col(recs, (r) => r.heartRate),
        speedMs: col(recs, (r) => r.enhancedSpeed),
        altitudeM: col(recs, (r) => r.enhancedAltitude),
      },
      maxHr
    )

    const gps = recs.filter((r) => r.positionLat != null && r.positionLong != null)
    const step = Math.max(1, Math.ceil(gps.length / MAX_COORDS))
    const coords = gps
      .filter((_, i) => i % step === 0)
      .map((r): [number, number] => [
        (r.positionLat as number) * DEG,
        (r.positionLong as number) * DEG,
      ])
    return { ...streams, polyline: coords.length > 0 ? polyline.encode(coords) : null }
  } catch {
    return EMPTY
  }
}

/** Stored streams, else a one-time FIT download for Garmin activities. Failures yield an empty, unstored result. */
export async function loadActivityStreams(
  db: DB,
  activity: Activity,
  maxHr: number | null
): Promise<FitStreams> {
  if (activity.streamData) return { ...EMPTY, ...(activity.streamData as Partial<FitStreams>) }
  if (activity.source === "strava") {
    // Legacy rows kept by installs that skipped the purge: Strava's summary map only.
    const line = (activity.rawData as { map?: { summary_polyline?: unknown } } | null)?.map
      ?.summary_polyline
    return { ...EMPTY, polyline: typeof line === "string" && line ? line : null }
  }
  if (activity.source !== "garmin") return EMPTY
  try {
    const client = await loadGarminClient(db, activity.userId)
    if (!client) throw new GarminError("key_invalid", "No Garmin key stored")
    const bytes = await client.getBytes(`/download-service/files/activity/${activity.externalId}`)
    const parsed = parseFitActivity(bytes, maxHr)
    if (parsed.points.length === 0) return EMPTY
    await db.update(activities).set({ streamData: parsed }).where(eq(activities.id, activity.id))
    return parsed
  } catch (err) {
    const code = err instanceof GarminError ? err.code : "streams_failed"
    console.warn(JSON.stringify({ userId: activity.userId, code }))
    return EMPTY
  }
}
