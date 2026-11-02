import { describe, expect, it, vi } from "vitest"
import type { Activity, UserProfile } from "../db/schema.js"
import {
  type RecapStreamEvent,
  computeRecapHash,
  recapDateSchema,
  streamAndSaveRecap,
} from "./daily-recap.js"

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    userId: "user-1",
    externalId: "1",
    source: "strava",
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

const date = "2024-03-01"
const a1 = makeActivity()
const a2 = makeActivity({ id: "a2", externalId: "2" })

describe("computeRecapHash", () => {
  const base = { date, activities: [a1, a2], profile: makeProfile() }

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
