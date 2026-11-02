import { and, asc, eq, gte, lte } from "drizzle-orm"
import type { DB } from "../db/index.js"
import { type DailyWellness, dailyWellness } from "../db/schema.js"

/** Rows for `date-days+1 … date`, ascending. */
export function loadWellness(
  db: DB,
  userId: string,
  date: string,
  days = 7
): Promise<DailyWellness[]> {
  const from = new Date(`${date}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - (days - 1))
  return db
    .select()
    .from(dailyWellness)
    .where(
      and(
        eq(dailyWellness.userId, userId),
        gte(dailyWellness.date, from.toISOString().slice(0, 10)),
        lte(dailyWellness.date, date)
      )
    )
    .orderBy(asc(dailyWellness.date))
}

/** Only fields that are final once the night is over; intraday values would churn the recap hash. */
export type RecapWellness = Pick<
  DailyWellness,
  | "date"
  | "sleepScore"
  | "sleepSeconds"
  | "deepSleepSeconds"
  | "remSleepSeconds"
  | "lightSleepSeconds"
  | "awakeSeconds"
  | "hrvLastNight"
  | "hrvWeeklyAvg"
  | "hrvStatus"
  | "bodyBatteryCharged"
  | "bodyBatteryAtWake"
> &
  Partial<Pick<DailyWellness, "stressAvg" | "restingHeartRate">>

/** Drops today's still-changing values (stress, RHR, current Body Battery, calories). */
export function settledWellness(rows: DailyWellness[], date: string): RecapWellness[] {
  return rows.map((r) => {
    const settled: RecapWellness = {
      date: r.date,
      sleepScore: r.sleepScore,
      sleepSeconds: r.sleepSeconds,
      deepSleepSeconds: r.deepSleepSeconds,
      remSleepSeconds: r.remSleepSeconds,
      lightSleepSeconds: r.lightSleepSeconds,
      awakeSeconds: r.awakeSeconds,
      hrvLastNight: r.hrvLastNight,
      hrvWeeklyAvg: r.hrvWeeklyAvg,
      hrvStatus: r.hrvStatus,
      bodyBatteryCharged: r.bodyBatteryCharged,
      bodyBatteryAtWake: r.bodyBatteryAtWake,
    }
    if (r.date !== date) {
      settled.stressAvg = r.stressAvg
      settled.restingHeartRate = r.restingHeartRate
    }
    return settled
  })
}
