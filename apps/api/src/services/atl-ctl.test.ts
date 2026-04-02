import { describe, expect, it } from "vitest"
import { calculateTrainingLoad } from "./atl-ctl.js"
import type { Activity } from "../db/schema.js"

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "test-id",
    userId: "user-id",
    externalId: "ext-1",
    source: "strava",
    name: null,
    sportType: "run",
    startDate: new Date(),
    durationSeconds: 3600, // 1 hour
    distanceMeters: null,
    elevationMeters: null,
    averageHeartRate: null,
    maxHeartRate: null,
    averagePaceSecondsPerKm: null,
    sufferScore: null,
    perceivedExertion: null,
    calories: null,
    rawData: null,
    rawDataHash: null,
    aiInsight: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe("calculateTrainingLoad", () => {
  it("returns zeros for empty activity list", () => {
    expect(calculateTrainingLoad([])).toEqual({ atl: 0, ctl: 0, tsb: 0 })
  })

  it("returns positive ATL and CTL after a recent session", () => {
    const activity = makeActivity({
      startDate: new Date(), // today
      durationSeconds: 3600,
      perceivedExertion: 7,
    })
    const result = calculateTrainingLoad([activity])
    expect(result.atl).toBeGreaterThan(0)
    expect(result.ctl).toBeGreaterThan(0)
  })

  it("TSB is within 0.1 of CTL - ATL (rounding artefact)", () => {
    const activity = makeActivity({
      startDate: new Date(),
      durationSeconds: 3600,
      perceivedExertion: 7,
    })
    const result = calculateTrainingLoad([activity])
    const diff = Math.round(Math.abs(result.tsb - (result.ctl - result.atl)) * 10) / 10
    expect(diff).toBeLessThanOrEqual(0.1)
  })

  it("ATL reacts faster than CTL (ATL > CTL after a single hard session)", () => {
    const activity = makeActivity({
      startDate: new Date(),
      durationSeconds: 7200, // 2 hours
      perceivedExertion: 9,
    })
    const result = calculateTrainingLoad([activity])
    expect(result.atl).toBeGreaterThan(result.ctl)
  })

  it("uses heart rate fallback when no RPE is set", () => {
    const withHR = makeActivity({
      startDate: new Date(),
      durationSeconds: 3600,
      averageHeartRate: 150,
      perceivedExertion: null,
    })
    const withRPE = makeActivity({
      startDate: new Date(),
      durationSeconds: 3600,
      perceivedExertion: 15, // 150 / 10 = 15
    })
    const r1 = calculateTrainingLoad([withHR])
    const r2 = calculateTrainingLoad([withRPE])
    expect(r1.atl).toBeCloseTo(r2.atl, 1)
  })

  it("uses default intensity of 5 when neither RPE nor HR is available", () => {
    const bare = makeActivity({
      startDate: new Date(),
      durationSeconds: 3600,
      averageHeartRate: null,
      perceivedExertion: null,
    })
    const withRPE5 = makeActivity({
      startDate: new Date(),
      durationSeconds: 3600,
      perceivedExertion: 5,
    })
    const r1 = calculateTrainingLoad([bare])
    const r2 = calculateTrainingLoad([withRPE5])
    expect(r1.atl).toBeCloseTo(r2.atl, 1)
  })

  it("old activities (> 42 days ago) have no effect on ATL or CTL", () => {
    const old = new Date()
    old.setDate(old.getDate() - 60)
    const activity = makeActivity({ startDate: old, durationSeconds: 7200, perceivedExertion: 10 })
    expect(calculateTrainingLoad([activity])).toEqual({ atl: 0, ctl: 0, tsb: 0 })
  })

  it("accumulates load from multiple sessions on the same day", () => {
    const today = new Date()
    const single = makeActivity({ startDate: today, durationSeconds: 7200, perceivedExertion: 7 })
    const double = [
      makeActivity({ startDate: today, durationSeconds: 3600, perceivedExertion: 7 }),
      makeActivity({ startDate: today, durationSeconds: 3600, perceivedExertion: 7 }),
    ]
    const r1 = calculateTrainingLoad([single])
    const r2 = calculateTrainingLoad(double)
    expect(r2.atl).toBeCloseTo(r1.atl, 1)
    expect(r2.ctl).toBeCloseTo(r1.ctl, 1)
  })
})
