import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { mapGarminActivity, mapSportType, mapWellnessDay } from "./mappers.js"

const fx = (n: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${n}.json`, import.meta.url), "utf8"))

describe("mapSportType", () => {
  const table: Record<string, string[]> = {
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
    other: ["kayaking", ""],
  }
  for (const [sport, keys] of Object.entries(table))
    for (const k of keys)
      it(`${k || "(empty)"} -> ${sport}`, () => expect(mapSportType(k)).toBe(sport))
})

describe("mapGarminActivity", () => {
  it("maps every column", () => {
    const a = mapGarminActivity(fx("activity"), "u1")
    expect(a).toMatchObject({
      userId: "u1",
      source: "garmin",
      externalId: "9900000001",
      name: "Evening Run",
      sportType: "run",
      durationSeconds: 3000,
      distanceMeters: 10000.5,
      elevationMeters: 85.5,
      averageHeartRate: 152,
      maxHeartRate: 178,
      averagePaceSecondsPerKm: 300,
      calories: 720,
    })
    expect(a.rawData).toEqual(fx("activity"))
  })
  it("keeps the UTC instant for a 23:30 Berlin start", () => {
    expect(mapGarminActivity(fx("activity"), "u1").startDate.toISOString()).toBe(
      "2026-11-01T22:30:00.000Z"
    )
  })
  it("gives swims no pace", () => {
    const raw = { ...(fx("activity") as object), activityType: { typeKey: "lap_swimming" } }
    expect(mapGarminActivity(raw, "u1").averagePaceSecondsPerKm).toBeNull()
  })
  it("gives no pace for zero distance", () => {
    expect(
      mapGarminActivity({ ...(fx("activity") as object), distance: 0 }, "u1")
        .averagePaceSecondsPerKm
    ).toBeNull()
  })
  it("throws on a missing activityId", () => {
    expect(() => mapGarminActivity(fx("activity-malformed"), "u1")).toThrow()
  })
})

describe("mapWellnessDay", () => {
  it("maps every column", () => {
    const w = mapWellnessDay("2026-11-01", {
      sleep: fx("sleep"),
      hrv: fx("hrv"),
      bodyBattery: fx("bodybattery"),
      stress: fx("stress"),
      summary: fx("summary"),
    })
    expect(w).toEqual({
      date: "2026-11-01",
      sleepScore: 82,
      sleepSeconds: 27000,
      deepSleepSeconds: 5400,
      remSleepSeconds: 5400,
      lightSleepSeconds: 14400,
      awakeSeconds: 1800,
      sleepStart: new Date(1793574000000),
      sleepEnd: new Date(1793601000000),
      hrvLastNight: 61,
      hrvWeeklyAvg: 55,
      hrvStatus: "BALANCED",
      bodyBatteryCharged: 64,
      bodyBatteryAtWake: 88,
      bodyBatteryCurrent: 71,
      stressAvg: 29,
      restingHeartRate: 48,
      caloriesTotal: 2700,
      caloriesActive: 900,
      caloriesResting: 1800,
    })
  })
  it("falls back to the stress endpoint and summary battery when parts are absent", () => {
    const w = mapWellnessDay("2026-11-01", {
      stress: fx("stress"),
      summary: { bodyBattery: { chargedValue: 66, latestValue: 70 } },
    })
    expect(w.stressAvg).toBe(31)
    expect(w.bodyBatteryCharged).toBe(66)
    expect(w.bodyBatteryCurrent).toBe(70)
    expect(w.bodyBatteryAtWake).toBeNull()
  })
  it("returns an all-null row for empty parts, keeping the date verbatim", () => {
    const w = mapWellnessDay("2026-11-01", {})
    expect(w.date).toBe("2026-11-01")
    expect(Object.entries(w).filter(([k, v]) => k !== "date" && v !== null)).toEqual([])
    expect(Object.keys(w)).toHaveLength(20)
  })
})
