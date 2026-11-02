import { and, between, eq } from "drizzle-orm"
import { z } from "zod"
import type { DB } from "../../db/index.js"
import { type GarminSync, activities, apiKeys, dailyWellness, garminSync } from "../../db/schema.js"
import { encrypt } from "../encryption.js"
import { GarminError, type GarminErrorCode } from "./client.js"
import { type GarminClient, loadGarminClient } from "./load-client.js"
import { mapGarminActivity, mapWellnessDay } from "./mappers.js"

export const SYNC_GATE_MS = 15 * 60_000
const DAY = 86400_000
const PAGE = 100
const CHUNK_DAYS = 28 // the shapes note shows no explicit range cap; stay conservative
const DEDUPE_MS = 2 * 60_000

export const garminStatusSchema = z.object({
  connected: z.boolean(),
  status: z.enum(["idle", "importing", "syncing", "error"]),
  lastSyncedAt: z.string().nullable(),
  lastError: z.enum(["key_invalid", "rate_limited", "garmin_unavailable"]).nullable(),
  keyExpiresAt: z.string().nullable(),
})
export type GarminStatus = z.infer<typeof garminStatusSchema>

export const isSyncDue = (lastSyncedAt: Date | null, now: Date, force: boolean): boolean =>
  force || lastSyncedAt === null || now.getTime() - lastSyncedAt.getTime() >= SYNC_GATE_MS

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function syncWindows(now: Date, lastSyncedAt: Date | null) {
  return lastSyncedAt
    ? {
        activitiesFrom: new Date(lastSyncedAt.getTime() - 2 * DAY),
        wellnessFrom: ymd(new Date(now.getTime() - 2 * DAY)),
        wellnessTo: ymd(now),
      }
    : {
        activitiesFrom: new Date(now.getTime() - 365 * DAY),
        wellnessFrom: ymd(new Date(now.getTime() - 90 * DAY)),
        wellnessTo: ymd(now),
      }
}

export function dateChunks(from: string, to: string, maxDays: number): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const end = Date.parse(to)
  for (let s = Date.parse(from); s <= end; s += maxDays * DAY)
    out.push([ymd(new Date(s)), ymd(new Date(Math.min(s + (maxDays - 1) * DAY, end)))])
  return out
}

// shortcut: in-process lock only, fine for the single-instance self-hosted API; use a DB advisory lock if scaled out.
const locks = new Set<string>()
export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T | "busy"> {
  if (locks.has(userId)) return "busy"
  locks.add(userId)
  try {
    return await fn()
  } finally {
    locks.delete(userId)
  }
}

export async function getGarminStatus(db: DB, userId: string): Promise<GarminStatus> {
  const [row] = await db.select().from(garminSync).where(eq(garminSync.userId, userId))
  if (!row)
    return {
      connected: false,
      status: "idle",
      lastSyncedAt: null,
      lastError: null,
      keyExpiresAt: null,
    }
  return {
    connected: true,
    status: row.status as GarminStatus["status"],
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError as GarminErrorCode | null,
    keyExpiresAt: row.keyExpiresAt?.toISOString() ?? null,
  }
}

const setSync = (db: DB, userId: string, set: Partial<typeof garminSync.$inferInsert>) =>
  db
    .update(garminSync)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(garminSync.userId, userId))

type Row = Record<string, unknown>
const byDate = (rows: unknown, field: string): Map<string, unknown> =>
  new Map((Array.isArray(rows) ? (rows as Row[]) : []).map((r) => [String(r[field]), r]))

const mapFailed = (userId: string) => console.warn(JSON.stringify({ userId, code: "map_failed" }))

async function syncActivities(
  db: DB,
  client: GarminClient,
  userId: string,
  from: Date,
  to: string
) {
  for (let start = 0; ; start += PAGE) {
    const page = await client.get<unknown[]>("/activitylist-service/activities/search/activities", {
      start,
      limit: PAGE,
      startDate: ymd(from),
      endDate: to,
    })
    for (const raw of page ?? []) {
      let row: ReturnType<typeof mapGarminActivity>
      try {
        row = mapGarminActivity(raw, userId)
      } catch {
        mapFailed(userId)
        continue
      }
      const { userId: _u, source: _s, externalId: _e, ...update } = row
      await db
        .insert(activities)
        .values(row)
        .onConflictDoUpdate({
          target: [activities.userId, activities.externalId, activities.source],
          set: update,
        })
      // Garmin supersedes the same workout imported earlier from Strava.
      const t = (row.startDate as Date).getTime()
      await db
        .delete(activities)
        .where(
          and(
            eq(activities.userId, userId),
            eq(activities.source, "strava"),
            between(activities.startDate, new Date(t - DEDUPE_MS), new Date(t + DEDUPE_MS))
          )
        )
    }
    if ((page ?? []).length < PAGE) return
  }
}

// Days without data (no-HRV device, before the watch existed, sleep not synced yet) may 404.
const noData = <T>(p: Promise<T | null>): Promise<T | null> =>
  p.catch((e) => {
    if (e instanceof GarminError && e.status === 404) return null
    throw e
  })

async function syncWellness(
  db: DB,
  client: GarminClient,
  userId: string,
  from: string,
  to: string
) {
  const hrv = new Map<string, unknown>()
  const battery = new Map<string, unknown>()
  const stress = new Map<string, unknown>()
  const summary = new Map<string, unknown>()
  // Sequential on purpose: no parallel bursts against Garmin.
  for (const [a, b] of dateChunks(from, to, CHUNK_DAYS)) {
    const range = { startDate: a, endDate: b }
    const h = await noData(
      client.get<{ hrvSummaries?: unknown }>(`/hrv-service/hrv/daily/${a}/${b}`)
    )
    for (const [k, v] of byDate(h?.hrvSummaries, "calendarDate")) hrv.set(k, v)
    const bb = await noData(
      client.get<unknown>("/wellness-service/wellness/bodyBattery/reports/daily", range)
    )
    for (const [k, v] of byDate(bb, "date")) battery.set(k, v)
    const st = await noData(
      client.get<unknown>(`/usersummary-service/stats/stress/daily/${a}/${b}`)
    )
    for (const [k, v] of byDate(st, "calendarDate")) stress.set(k, v)
    const su = await noData(
      client.get<{ data?: unknown }>("/usersummary-service/v2/dailysummaries", range)
    )
    for (const [k, v] of byDate(su?.data, "calendarDate")) summary.set(k, v)
  }
  for (const [a] of dateChunks(from, to, 1)) {
    const sleep = await noData(client.get<unknown>("/sleep-service/sleep/dailySleep", { date: a }))
    let row: ReturnType<typeof mapWellnessDay>
    try {
      row = mapWellnessDay(a, {
        sleep,
        hrv: hrv.get(a),
        bodyBattery: battery.get(a),
        stress: stress.get(a),
        summary: summary.get(a),
      })
    } catch {
      mapFailed(userId)
      continue
    }
    // Never overwrite stored values with nulls from an empty/partial Garmin response.
    const update = Object.fromEntries(
      Object.entries(row).filter(([k, v]) => k !== "date" && v != null)
    )
    await db
      .insert(dailyWellness)
      .values({ ...row, userId })
      .onConflictDoUpdate({
        target: [dailyWellness.userId, dailyWellness.date],
        set: { ...update, updatedAt: new Date() },
      })
  }
}

export async function runGarminSync(
  db: DB,
  userId: string,
  opts: { initial: boolean }
): Promise<void> {
  try {
    await setSync(db, userId, { status: opts.initial ? "importing" : "syncing" })
    const client = await loadGarminClient(db, userId)
    if (!client) throw new GarminError("key_invalid", "No Garmin key stored")
    const [prev] = await db
      .select({ lastSyncedAt: garminSync.lastSyncedAt })
      .from(garminSync)
      .where(eq(garminSync.userId, userId))
    const now = new Date()
    const w = syncWindows(now, opts.initial ? null : (prev?.lastSyncedAt ?? null))
    await syncActivities(db, client, userId, w.activitiesFrom, w.wellnessTo)
    await syncWellness(db, client, userId, w.wellnessFrom, w.wellnessTo)
    await setSync(db, userId, {
      status: "idle",
      lastSyncedAt: now,
      lastError: null,
      ...(opts.initial ? { importedAt: now } : {}),
    })
  } catch (e) {
    const code: GarminErrorCode = e instanceof GarminError ? e.code : "garmin_unavailable"
    // Never log e.message: it could carry health data or DB details.
    if (!(e instanceof GarminError))
      console.error(
        JSON.stringify({
          userId,
          code: "sync_internal_error",
          err: e instanceof Error ? e.constructor.name : typeof e,
        })
      )
    await setSync(db, userId, { status: "error", lastError: code })
  }
}

// After a failed run, the last attempt (updatedAt) gates auto-syncs so we don't hammer Garmin.
const gateRef = (row: GarminSync) => (row.status === "error" ? row.updatedAt : row.lastSyncedAt)

/** Runs a sync under the user lock without awaiting it; runGarminSync records its own failures. */
function startInBackground(db: DB, userId: string, initial: boolean): void {
  void withUserLock(userId, () => runGarminSync(db, userId, { initial })).catch((e) =>
    console.error(
      JSON.stringify({
        userId,
        code: "sync_crashed",
        err: e instanceof Error ? e.constructor.name : typeof e,
      })
    )
  )
}

/** Stores the (new or renewed) key and syncs in the background: a full import unless one already finished. */
export async function connectGarmin(
  db: DB,
  userId: string,
  key: string,
  keyExpiresAt: Date | null
): Promise<GarminStatus> {
  const encryptedKey = encrypt(key)
  const initial = await db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ importedAt: garminSync.importedAt })
      .from(garminSync)
      .where(eq(garminSync.userId, userId))
    const initial = !prev?.importedAt
    const status = initial ? "importing" : "syncing"
    await tx
      .insert(apiKeys)
      .values({ userId, provider: "garmin", encryptedKey })
      .onConflictDoUpdate({ target: [apiKeys.userId, apiKeys.provider], set: { encryptedKey } })
    await tx
      .insert(garminSync)
      .values({ userId, status, keyExpiresAt })
      .onConflictDoUpdate({
        target: garminSync.userId,
        set: { status, lastError: null, keyExpiresAt, updatedAt: new Date() },
      })
    return initial
  })
  startInBackground(db, userId, initial)
  return getGarminStatus(db, userId)
}

/** Gate + lock + incremental sync for POST /garmin/sync. Returns the status without calling Garmin when skipped. */
export async function syncIfDue(db: DB, userId: string, force: boolean): Promise<GarminStatus> {
  let importNeeded = false
  await withUserLock(userId, async () => {
    // Read inside the lock so a concurrent run's result is seen.
    const [row] = await db.select().from(garminSync).where(eq(garminSync.userId, userId))
    if (!row || !isSyncDue(gateRef(row), new Date(), force)) return
    if (row.importedAt === null) {
      // Failed or stale (server restart) initial import: redo it in the background, as /connect
      // does, instead of blocking this request for minutes.
      await setSync(db, userId, { status: "importing" })
      importNeeded = true
      return
    }
    await runGarminSync(db, userId, { initial: false })
  })
  // After our lock is released: startInBackground takes it itself (a concurrent run makes it a no-op).
  if (importNeeded) startInBackground(db, userId, true)
  return getGarminStatus(db, userId)
}
