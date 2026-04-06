import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getActivityStreams, stravaActivityToDbFields } from "./strava-client.js"
import type { StravaActivity } from "./strava-client.js"

function makeStravaActivity(overrides: Partial<StravaActivity> = {}): StravaActivity {
  return {
    id: 12345,
    name: "Morning Run",
    type: "Run",
    sport_type: "Run",
    start_date: "2024-03-01T07:00:00Z",
    elapsed_time: 3600,
    distance: 10000,
    total_elevation_gain: 50,
    ...overrides,
  }
}

describe("stravaActivityToDbFields", () => {
  it("maps basic fields correctly", () => {
    const fields = stravaActivityToDbFields(makeStravaActivity(), "user-1")
    expect(fields.userId).toBe("user-1")
    expect(fields.externalId).toBe("12345")
    expect(fields.source).toBe("strava")
    expect(fields.name).toBe("Morning Run")
    expect(fields.durationSeconds).toBe(3600)
    expect(fields.distanceMeters).toBe(10000)
    expect(fields.startDate).toEqual(new Date("2024-03-01T07:00:00Z"))
  })

  it("lowercases sport_type", () => {
    const fields = stravaActivityToDbFields(makeStravaActivity({ sport_type: "Ride" }), "user-1")
    expect(fields.sportType).toBe("ride")
  })

  it("falls back to type when sport_type is missing", () => {
    const activity = makeStravaActivity({ sport_type: "", type: "Swim" })
    const fields = stravaActivityToDbFields(activity, "user-1")
    expect(fields.sportType).toBe("swim")
  })

  it("defaults to 'other' when both type fields are empty", () => {
    const activity = makeStravaActivity({ sport_type: "", type: "" })
    const fields = stravaActivityToDbFields(activity, "user-1")
    expect(fields.sportType).toBe("other")
  })

  it("rounds heart rate values", () => {
    const fields = stravaActivityToDbFields(
      makeStravaActivity({ average_heartrate: 142.7, max_heartrate: 178.3 }),
      "user-1"
    )
    expect(fields.averageHeartRate).toBe(143)
    expect(fields.maxHeartRate).toBe(178)
  })

  it("calculates pace from average_speed", () => {
    // 3 m/s = 333 sec/km
    const fields = stravaActivityToDbFields(makeStravaActivity({ average_speed: 3 }), "user-1")
    expect(fields.averagePaceSecondsPerKm).toBe(333)
  })

  it("sets pace to null when average_speed is 0", () => {
    const fields = stravaActivityToDbFields(makeStravaActivity({ average_speed: 0 }), "user-1")
    expect(fields.averagePaceSecondsPerKm).toBeNull()
  })

  it("sets pace to null when average_speed is absent", () => {
    const fields = stravaActivityToDbFields(makeStravaActivity(), "user-1")
    expect(fields.averagePaceSecondsPerKm).toBeNull()
  })

  it("sets nulls for optional fields when absent", () => {
    const fields = stravaActivityToDbFields(makeStravaActivity(), "user-1")
    expect(fields.averageHeartRate).toBeNull()
    expect(fields.maxHeartRate).toBeNull()
    expect(fields.sufferScore).toBeNull()
    expect(fields.calories).toBeNull()
    expect(fields.perceivedExertion).toBeNull()
  })

  it("stores elevation gain", () => {
    const fields = stravaActivityToDbFields(
      makeStravaActivity({ total_elevation_gain: 320 }),
      "user-1"
    )
    expect(fields.elevationMeters).toBe(320)
  })

  it("stores raw activity data", () => {
    const activity = makeStravaActivity()
    const fields = stravaActivityToDbFields(activity, "user-1")
    expect(fields.rawData).toEqual(activity)
  })

  it("maps perceived_exertion from detail endpoint", () => {
    const fields = stravaActivityToDbFields(makeStravaActivity({ perceived_exertion: 7 }), "user-1")
    expect(fields.perceivedExertion).toBe(7)
  })

  it("maps calories from detail endpoint", () => {
    const fields = stravaActivityToDbFields(makeStravaActivity({ calories: 650 }), "user-1")
    expect(fields.calories).toBe(650)
  })
})

// ---------------------------------------------------------------------------
// getActivityStreams
// ---------------------------------------------------------------------------

function makeRawStreams(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    distance: { data: [0, 500, 1000, 1500, 2000] },
    heartrate: { data: [120, 130, 140, 150, 160] },
    velocity_smooth: { data: [3.0, 3.2, 3.4, 3.6, 3.8] },
    altitude: { data: [10, 11, 12, 13, 14] },
    ...overrides,
  }
}

function mockFetch(body: unknown, ok = true) {
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    json: () => Promise.resolve(body),
  } as Response)
}

describe("getActivityStreams", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns points with correct distance and speed conversions", async () => {
    mockFetch(makeRawStreams())
    const { points } = await getActivityStreams("token", "123", null)

    expect(points[0].distanceKm).toBe(0)
    expect(points[1].distanceKm).toBe(0.5) // 500 m
    expect(points[2].distanceKm).toBe(1) // 1000 m
    // 3.0 m/s × 3.6 = 10.8 km/h, rounded to 1dp
    expect(points[0].speedKmh).toBe(10.8)
  })

  it("classifies heart rates into zones using provided maxHr", async () => {
    // HR values relative to maxHr=200: 50%, 60%, 75%, 85%, 95% → Z1 Z2 Z3 Z4 Z5
    mockFetch(
      makeRawStreams({
        distance: { data: [0, 100, 200, 300, 400] },
        heartrate: { data: [100, 120, 150, 170, 190] },
      })
    )
    const { hrZones } = await getActivityStreams("token", "123", 200)

    expect(hrZones).not.toBeNull()
    expect(hrZones?.zone1).toBe(1) // 100/200 = 50% < 60%
    expect(hrZones?.zone2).toBe(1) // 120/200 = 60% → [60,70)
    expect(hrZones?.zone3).toBe(1) // 150/200 = 75% → [70,80)
    expect(hrZones?.zone4).toBe(1) // 170/200 = 85% → [80,90)
    expect(hrZones?.zone5).toBe(1) // 190/200 = 95% ≥ 90%
  })

  it("estimates maxHr from data when not provided", async () => {
    // max HR = 190 → estimated = round(190/0.95) = 200
    mockFetch(
      makeRawStreams({
        distance: { data: [0, 100] },
        heartrate: { data: [150, 190] },
      })
    )
    const { maxHrUsed } = await getActivityStreams("token", "123", null)
    expect(maxHrUsed).toBe(200)
  })

  it("returns null hrZones and null heartrate points when no heartrate stream", async () => {
    mockFetch(makeRawStreams({ heartrate: undefined }))
    const { hrZones, maxHrUsed, points } = await getActivityStreams("token", "123", null)

    expect(hrZones).toBeNull()
    expect(maxHrUsed).toBeNull()
    expect(points[0].heartrate).toBeNull()
  })

  it("returns empty result when no distance stream", async () => {
    mockFetch({})
    const { points, hrZones, maxHrUsed } = await getActivityStreams("token", "123", null)

    expect(points).toHaveLength(0)
    expect(hrZones).toBeNull()
    expect(maxHrUsed).toBeNull()
  })

  it("downsamples to at most 500 points for large datasets", async () => {
    const n = 1500
    mockFetch({
      distance: { data: Array.from({ length: n }, (_, i) => i * 10) },
      heartrate: { data: Array.from({ length: n }, () => 150) },
    })
    const { points } = await getActivityStreams("token", "123", 180)
    expect(points.length).toBeLessThanOrEqual(500)
  })

  it("includes all points when dataset is within 500 limit", async () => {
    mockFetch(makeRawStreams()) // 5 points
    const { points } = await getActivityStreams("token", "123", null)
    expect(points).toHaveLength(5)
  })

  it("throws on non-ok HTTP response", async () => {
    mockFetch(null, false)
    await expect(getActivityStreams("token", "123", null)).rejects.toThrow("Strava streams error")
  })
})
