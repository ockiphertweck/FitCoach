// Inputs Task 4 (sync) must feed into mapWellnessDay, one day each:
//  parts.sleep       = sleep-service dailySleep response for the date (flat, epoch-ms sleep*TimestampGMT)
//  parts.hrv         = one element of hrv-service hrv/daily `hrvSummaries` (flat; one range call covers many days)
//  parts.bodyBattery = the element of wellness-service bodyBattery/reports/daily for the date
//  parts.stress      = the element of usersummary-service stats/stress/daily for the date (fallback for summary.stress)
//  parts.summary     = the element of usersummary-service v2/dailysummaries `data` for the date
import type { SportType } from "@fitcoach/shared"
import { z } from "zod"
import type { NewActivity, NewDailyWellness } from "../../db/schema.js"

const SPORT: Record<string, SportType> = {}
for (const [sport, keys] of Object.entries({
  run: ["running", "trail_running", "treadmill_running", "track_running"],
  ride: [
    "cycling",
    "road_biking",
    "mountain_biking",
    "gravel_cycling",
    "indoor_cycling",
    "virtual_ride",
  ],
  swim: ["lap_swimming", "open_water_swimming"],
  walk: ["walking"],
  hike: ["hiking"],
  yoga: ["yoga", "pilates"],
  workout: ["strength_training", "fitness_equipment", "hiit", "cardio", "indoor_cardio"],
} as Record<SportType, string[]>))
  for (const k of keys) SPORT[k] = sport as SportType

export const mapSportType = (typeKey: string): SportType => SPORT[typeKey] ?? "other"

// Garmin "...GMT" strings are UTC without a zone suffix.
const parseGmt = (s: string): Date => {
  const d = new Date(`${s.trim().replace(" ", "T")}Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid Garmin GMT timestamp: ${s}`)
  return d
}
const int = (n: number | null | undefined): number | null => (n == null ? null : Math.round(n))

const ActivityIn = z
  .object({
    activityId: z.number(),
    activityName: z.string().nullish(),
    startTimeGMT: z.string(),
    activityType: z.object({ typeKey: z.string() }).passthrough(),
    duration: z.number().nullish(),
    distance: z.number().nullish(),
    elevationGain: z.number().nullish(), // not in the probed shape; null when absent
    averageHR: z.number().nullish(),
    maxHR: z.number().nullish(),
    calories: z.number().nullish(),
  })
  .passthrough()

const PACED: SportType[] = ["run", "walk", "hike"]

/** raw = one element of activitylist-service activities/search/activities. */
export function mapGarminActivity(raw: unknown, userId: string): NewActivity {
  const a = ActivityIn.parse(raw)
  const sportType = mapSportType(a.activityType.typeKey)
  const pace =
    PACED.includes(sportType) && a.distance && a.distance > 0 && a.duration != null
      ? Math.round(a.duration / (a.distance / 1000))
      : null
  return {
    userId,
    source: "garmin",
    externalId: String(a.activityId),
    name: a.activityName ?? null,
    sportType,
    startDate: parseGmt(a.startTimeGMT),
    durationSeconds: int(a.duration),
    distanceMeters: a.distance ?? null,
    elevationMeters: a.elevationGain ?? null,
    averageHeartRate: int(a.averageHR),
    maxHeartRate: int(a.maxHR),
    averagePaceSecondsPerKm: pace,
    calories: int(a.calories),
    rawData: raw,
  }
}

const num = z.number().nullish()
const SleepIn = z
  .object({
    sleepTimeSeconds: num,
    deepSleepSeconds: num,
    lightSleepSeconds: num,
    remSleepSeconds: num,
    awakeSleepSeconds: num,
    sleepStartTimestampGMT: num,
    sleepEndTimestampGMT: num,
    sleepScores: z
      .object({ overall: z.object({ value: num }).passthrough().nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough()
const HrvIn = z
  .object({ lastNightAvg: num, weeklyAvg: num, status: z.string().nullish() })
  .passthrough()
const BatteryIn = z
  .object({
    bodyBatteryValuesArray: z.array(z.array(z.number().nullable())).nullish(),
    bodyBatteryValueDescriptorDTOList: z
      .array(
        z.object({
          bodyBatteryValueDescriptorIndex: z.number(),
          bodyBatteryValueDescriptorKey: z.string(),
        })
      )
      .nullish(),
  })
  .passthrough()
const StressIn = z
  .object({ values: z.object({ overallStressLevel: num }).passthrough().nullish() })
  .passthrough()
const SummaryIn = z
  .object({
    calories: z.object({ burnedTotal: num, burnedActive: num, burnedResting: num }).nullish(),
    heartRate: z.object({ restingValue: num }).nullish(),
    stress: z.object({ avgLevel: num }).nullish(),
    bodyBattery: z.object({ latestValue: num }).nullish(),
  })
  .passthrough()

const opt = <T>(s: z.ZodType<T>, v: unknown): T | undefined => (v == null ? undefined : s.parse(v))
const ms = (n: number | null | undefined): Date | null => (n == null ? null : new Date(n))

export function mapWellnessDay(
  date: string,
  parts: {
    sleep?: unknown
    hrv?: unknown
    bodyBattery?: unknown
    stress?: unknown
    summary?: unknown
  }
): Omit<NewDailyWellness, "userId"> {
  const sleep = opt(SleepIn, parts.sleep)
  const hrv = opt(HrvIn, parts.hrv)
  const bb = opt(BatteryIn, parts.bodyBattery)
  const stress = opt(StressIn, parts.stress)
  const sum = opt(SummaryIn, parts.summary)

  // Readings are [timestampMs, level]; column positions come from the descriptor list.
  const desc = bb?.bodyBatteryValueDescriptorDTOList ?? []
  const idx = (key: string, dflt: number) =>
    desc.find((d) => d.bodyBatteryValueDescriptorKey === key)?.bodyBatteryValueDescriptorIndex ??
    dflt
  const [ti, li] = [idx("timestamp", 0), idx("bodyBatteryLevel", 1)]
  const readings = (bb?.bodyBatteryValuesArray ?? [])
    .map((r) => ({ t: r[ti], level: r[li] }))
    .filter((r): r is { t: number; level: number } => r.t != null && r.level != null)
    .sort((a, b) => a.t - b.t)
  const sleepEnd = sleep?.sleepEndTimestampGMT
  const sleepStart = sleep?.sleepStartTimestampGMT
  const night =
    sleepEnd == null
      ? []
      : readings.filter((r) => r.t <= sleepEnd && (sleepStart == null || r.t >= sleepStart))
  // Overnight charge, not Garmin's calendar-day `charged`: that keeps rising with daytime
  // recharge and would churn the recap hash on every sync.
  const charged =
    night.length === 0
      ? null
      : night.reduce(
          (sum, r, i) => (i > 0 ? sum + Math.max(0, r.level - night[i - 1].level) : 0),
          0
        )
  const atWake = sleepEnd == null ? undefined : readings.filter((r) => r.t <= sleepEnd).at(-1)

  return {
    date,
    sleepScore: int(sleep?.sleepScores?.overall?.value),
    sleepSeconds: int(sleep?.sleepTimeSeconds),
    deepSleepSeconds: int(sleep?.deepSleepSeconds),
    remSleepSeconds: int(sleep?.remSleepSeconds),
    lightSleepSeconds: int(sleep?.lightSleepSeconds),
    awakeSeconds: int(sleep?.awakeSleepSeconds),
    sleepStart: ms(sleep?.sleepStartTimestampGMT),
    sleepEnd: ms(sleepEnd),
    hrvLastNight: int(hrv?.lastNightAvg),
    hrvWeeklyAvg: int(hrv?.weeklyAvg),
    hrvStatus: hrv?.status ?? null,
    bodyBatteryCharged: int(charged),
    bodyBatteryAtWake: atWake?.level ?? null,
    bodyBatteryCurrent: int(readings.at(-1)?.level ?? sum?.bodyBattery?.latestValue),
    stressAvg: int(sum?.stress?.avgLevel ?? stress?.values?.overallStressLevel),
    restingHeartRate: int(sum?.heartRate?.restingValue),
    caloriesTotal: int(sum?.calories?.burnedTotal),
    caloriesActive: int(sum?.calories?.burnedActive),
    caloriesResting: int(sum?.calories?.burnedResting),
  }
}
