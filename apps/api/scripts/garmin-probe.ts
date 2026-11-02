// Prints the SHAPE (key -> type tree) of Garmin Personal API responses. Never prints values.
import { resolve } from "node:path"
import dotenv from "dotenv"
import { unzipSync } from "fflate"
import { GARMIN_API_BASE, createGarminClient } from "../src/services/garmin/client.js"

dotenv.config({ path: resolve(import.meta.dirname, "../../../.env") })
const key = process.env.GARMIN_API_KEY
if (!key) {
  console.error("GARMIN_API_KEY is not set (put it in the repo .env or export it).")
  process.exit(1)
}

function shape(v: unknown): unknown {
  if (v === null) return "null"
  if (Array.isArray(v)) return v.length ? `array<${JSON.stringify(shape(v[0]))}>` : "array<empty>"
  if (typeof v === "object") {
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shape(x)]))
  }
  return typeof v
}

const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10)
const yesterday = day(-1)
const d7 = day(-7)

async function show(label: string, fn: () => Promise<unknown>) {
  console.log(`\n=== ${label}`)
  try {
    console.log(JSON.stringify(shape(await fn()), null, 2))
  } catch (e) {
    console.log(`ERROR: ${e instanceof Error ? e.message : "unknown"}`)
  }
}

async function main() {
  const c = createGarminClient(key as string)
  console.log(`base: ${GARMIN_API_BASE}`)
  // shortcut: client exposes no status/headers, so errors show as GarminError codes only; add a header dump if rate limits need study.
  console.log("token response: string (bare JWT with exp claim)")

  let firstId: string | number | undefined
  await show("activity search (30d, limit 5)", async () => {
    const r = await c.get<unknown>("/activitylist-service/activities/search/activities", {
      start: 0,
      limit: 5,
      startDate: day(-30),
      endDate: day(0),
    })
    firstId = Array.isArray(r) ? (r[0] as { activityId?: string | number })?.activityId : undefined
    return r
  })
  if (firstId !== undefined) {
    await show("activity/{id}", () => c.get(`/activity-service/activity/${firstId}`))
    console.log("\n=== download-service/files/activity/{id}")
    try {
      const bytes = await c.getBytes(`/download-service/files/activity/${firstId}`)
      console.log(`bytes: ${bytes.length}`)
      console.log(`zip entries: ${Object.keys(unzipSync(bytes)).join(", ")}`)
    } catch (e) {
      console.log(`ERROR: ${e instanceof Error ? e.message : "unknown"}`)
    }
  }
  const range = { startDate: d7, endDate: yesterday }
  await show("dailySleep", () => c.get("/sleep-service/sleep/dailySleep", { date: yesterday }))
  await show("dailySleepSummariesByDate", () =>
    c.get("/sleep-service/sleep/dailySleepSummariesByDate", range)
  )
  await show("hrv/{yesterday}", () => c.get(`/hrv-service/hrv/${yesterday}`))
  await show("hrv/daily/{7d}", () => c.get(`/hrv-service/hrv/daily/${d7}/${yesterday}`))
  await show("bodyBattery/reports/daily", () =>
    c.get("/wellness-service/wellness/bodyBattery/reports/daily", range)
  )
  await show("stats/stress/daily", () =>
    c.get(`/usersummary-service/stats/stress/daily/${d7}/${yesterday}`)
  )
  await show("v2/dailysummaries", () => c.get("/usersummary-service/v2/dailysummaries", range))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "probe failed")
  process.exit(1)
})
