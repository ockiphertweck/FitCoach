import { describe, expect, it, vi } from "vitest"
import type { Activity, DailyWellness, UserProfile } from "../db/schema.js"
import {
  type RecapStreamEvent,
  computeRecapHash,
  recapDateSchema,
  recapWindowStart,
  streamAndSaveRecap,
} from "./daily-recap.js"
import { mapWellnessDay } from "./garmin/mappers.js"
import { settledWellness } from "./wellness.js"

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    userId: "user-1",
    externalId: "1",
    source: "garmin",
    sportType: "run",
    name: "Run",
    startDate: new Date("2024-03-01T07:00:00Z"),
    durationSeconds: 3600,
    distanceMeters: 10000,
    elevationMeters: 50,
    averageHeartRate: 150,
    maxHeartRate: 170,
    averagePaceSecondsPerKm: 360,
    sufferScore: null,
    perceivedExertion: null,
    calories: null,
    rawData: { kudos_count: 1 },
    ...overrides,
  } as Activity
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: "user-1",
    sex: "male",
    weightKg: 70,
    heightCm: 180,
    maxHeartRate: 190,
    ftpWatts: 250,
    vo2max: null,
    goals: null,
    preferences: null,
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  } as UserProfile
}

const wRow = (d: string, o: Partial<DailyWellness> = {}) =>
  ({
    date: d,
    sleepScore: 80,
    sleepSeconds: 27000,
    deepSleepSeconds: 5000,
    remSleepSeconds: 6000,
    lightSleepSeconds: 14000,
    awakeSeconds: 2000,
    hrvLastNight: 60,
    hrvWeeklyAvg: 58,
    hrvStatus: "BALANCED",
    bodyBatteryCharged: 70,
    bodyBatteryAtWake: 85,
    bodyBatteryCurrent: 40,
    stressAvg: 30,
    restingHeartRate: 50,
    caloriesTotal: 2000,
    ...o,
  }) as DailyWellness

const date = "2024-03-01"
const a1 = makeActivity()
const a2 = makeActivity({ id: "a2", externalId: "2" })

describe("computeRecapHash", () => {
  const base = { date, activities: [a1, a2], profile: makeProfile(), wellness: [] }

  it("is stable and independent of activity order", () => {
    expect(computeRecapHash(base)).toBe(computeRecapHash({ ...base }))
    expect(computeRecapHash(base)).toBe(computeRecapHash({ ...base, activities: [a2, a1] }))
  })

  it("changes when an activity is added, removed or its duration changes", () => {
    const h = computeRecapHash(base)
    expect(
      computeRecapHash({ ...base, activities: [a1, a2, makeActivity({ id: "a3" })] })
    ).not.toBe(h)
    expect(computeRecapHash({ ...base, activities: [a1] })).not.toBe(h)
    expect(
      computeRecapHash({
        ...base,
        activities: [a1, makeActivity({ id: "a2", durationSeconds: 1 })],
      })
    ).not.toBe(h)
  })

  it("ignores kudos_count changes", () => {
    const a2k = makeActivity({ id: "a2", externalId: "2", rawData: { kudos_count: 99 } })
    expect(computeRecapHash({ ...base, activities: [a1, a2k] })).toBe(computeRecapHash(base))
  })

  it("tracks profile data but not updatedAt", () => {
    const h = computeRecapHash(base)
    expect(computeRecapHash({ ...base, profile: makeProfile({ weightKg: 71 }) })).not.toBe(h)
    expect(
      computeRecapHash({ ...base, profile: makeProfile({ updatedAt: new Date("2025-01-01") }) })
    ).toBe(h)
    expect(computeRecapHash({ ...base, profile: null })).not.toBe(h)
  })

  it("changes when date changes", () => {
    expect(computeRecapHash({ ...base, date: "2024-03-02" })).not.toBe(computeRecapHash(base))
  })
})

const delta = (text: string): RecapStreamEvent => ({
  type: "content_block_delta",
  delta: { type: "text_delta", text },
})

async function* events(...e: RecapStreamEvent[]) {
  yield* e
}

describe("streamAndSaveRecap", () => {
  it("streams text, saves once and returns full text", async () => {
    const onText = vi.fn()
    const save = vi.fn().mockResolvedValue(undefined)
    const stream = events({ type: "message_start" }, delta("Easy "), delta("ride"))
    await expect(streamAndSaveRecap({ stream, onText, save })).resolves.toBe("Easy ride")
    expect(onText).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith("Easy ride")
  })

  it("saves even when onText throws, and stops calling it", async () => {
    const onText = vi.fn(() => {
      throw new Error("client gone")
    })
    const save = vi.fn().mockResolvedValue(undefined)
    await streamAndSaveRecap({ stream: events(delta("Easy "), delta("ride")), onText, save })
    expect(onText).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith("Easy ride")
  })

  it("does not save when the stream errors", async () => {
    async function* failing() {
      yield delta("Easy ")
      throw new Error("boom")
    }
    const save = vi.fn()
    await expect(streamAndSaveRecap({ stream: failing(), onText: vi.fn(), save })).rejects.toThrow(
      "boom"
    )
    expect(save).not.toHaveBeenCalled()
  })
})

describe("recapDateSchema", () => {
  it("accepts a valid date", () => {
    expect(recapDateSchema.safeParse({ date: "2026-11-02" }).success).toBe(true)
  })
  it.each([{ date: "2026-13-01" }, { date: "today" }, {}])("rejects %j", (v) => {
    expect(recapDateSchema.safeParse(v).success).toBe(false)
  })
})

describe("recapWindowStart", () => {
  it("is 42 days before the date at UTC midnight, independent of now", () => {
    expect(recapWindowStart("2026-11-02").toISOString()).toBe("2026-09-21T00:00:00.000Z")
    expect(recapWindowStart("2026-11-02", 14).toISOString()).toBe("2026-10-19T00:00:00.000Z")
  })
})

describe("streamAndSaveRecap empty output", () => {
  it("does not save a whitespace-only recap but returns it", async () => {
    const save = vi.fn()
    await expect(
      streamAndSaveRecap({ stream: events(delta("  \n")), onText: vi.fn(), save })
    ).resolves.toBe("  \n")
    expect(save).not.toHaveBeenCalled()
  })
})

describe("computeRecapHash wellness", () => {
  const w = (o: Partial<DailyWellness> = {}) =>
    settledWellness([wRow("2024-03-01"), wRow("2024-03-02", o)], "2024-03-02")
  const base = { date, activities: [a1], profile: makeProfile() }

  it("is unchanged by intraday values of today", () => {
    const h = computeRecapHash({ ...base, wellness: w() })
    for (const o of [
      { caloriesTotal: 9999 },
      { bodyBatteryCurrent: 1 },
      { stressAvg: 99 },
      { restingHeartRate: 99 },
    ])
      expect(computeRecapHash({ ...base, wellness: w(o) })).toBe(h)
  })

  it("is unchanged by daytime Body Battery readings after wake", () => {
    const sleep = { sleepStartTimestampGMT: 1_000, sleepEndTimestampGMT: 5_000 }
    const night = [
      [1_000, 20],
      [3_000, 60],
      [5_000, 85],
    ]
    // Garmin's calendar-day `charged` keeps rising with daytime recharge.
    const hash = (values: number[][], charged: number) =>
      computeRecapHash({
        ...base,
        wellness: settledWellness(
          [
            wRow("2024-03-01"),
            {
              ...wRow("2024-03-02"),
              ...mapWellnessDay("2024-03-02", {
                sleep,
                bodyBattery: { charged, bodyBatteryValuesArray: values },
              }),
            },
          ],
          "2024-03-02"
        ),
      })
    const h = hash(night, 65)
    expect(hash([...night, [6_000, 40], [7_000, 70]], 95)).toBe(h)
    expect(hash([...night, [6_000, 40], [7_000, 70], [8_000, 95]], 120)).toBe(h)
  })

  it("changes when sleep score or HRV changes, or a day appears", () => {
    const h = computeRecapHash({ ...base, wellness: w() })
    expect(computeRecapHash({ ...base, wellness: w({ sleepScore: 50 }) })).not.toBe(h)
    expect(computeRecapHash({ ...base, wellness: w({ hrvLastNight: 10 }) })).not.toBe(h)
    expect(computeRecapHash({ ...base, wellness: w().slice(0, 1) })).not.toBe(h)
  })

  it("is computable without wellness", () => {
    expect(computeRecapHash({ ...base, wellness: [] })).toMatch(/^[0-9a-f]{64}$/)
  })
})
