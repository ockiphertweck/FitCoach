import { describe, expect, it } from "vitest"
import type { DailyWellness } from "../db/schema.js"
import { settledWellness } from "./wellness.js"

const row = (date: string, o: Partial<DailyWellness> = {}): DailyWellness =>
  ({
    id: "i",
    userId: "u",
    date,
    sleepScore: 80,
    sleepSeconds: 27000,
    deepSleepSeconds: 5000,
    remSleepSeconds: 6000,
    lightSleepSeconds: 14000,
    awakeSeconds: 2000,
    sleepStart: null,
    sleepEnd: null,
    hrvLastNight: 60,
    hrvWeeklyAvg: 58,
    hrvStatus: "BALANCED",
    bodyBatteryCharged: 70,
    bodyBatteryAtWake: 85,
    bodyBatteryCurrent: 40,
    stressAvg: 30,
    restingHeartRate: 50,
    caloriesTotal: 2000,
    caloriesActive: 500,
    caloriesResting: 1500,
    updatedAt: new Date(),
    ...o,
  }) as DailyWellness

describe("settledWellness", () => {
  const [yesterday, today] = settledWellness([row("2024-03-01"), row("2024-03-02")], "2024-03-02")

  it("drops today's still-changing values", () => {
    expect(today).not.toHaveProperty("stressAvg")
    expect(today).not.toHaveProperty("restingHeartRate")
    expect(today.sleepScore).toBe(80)
    expect(today.bodyBatteryAtWake).toBe(85)
  })
  it("keeps stress and RHR for earlier days", () => {
    expect(yesterday.stressAvg).toBe(30)
    expect(yesterday.restingHeartRate).toBe(50)
  })
  it("never includes calories, current Body Battery or ids", () => {
    for (const r of [yesterday, today])
      for (const k of ["caloriesTotal", "caloriesActive", "bodyBatteryCurrent", "userId", "id"])
        expect(r).not.toHaveProperty(k)
  })
})
