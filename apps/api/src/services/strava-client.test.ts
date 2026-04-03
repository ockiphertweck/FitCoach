import { describe, expect, it } from "vitest"
import { stravaActivityToDbFields } from "./strava-client.js"
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
})
