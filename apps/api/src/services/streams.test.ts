import { describe, expect, it } from "vitest"
import { buildStreams } from "./streams.js"

const base = { speedMs: null, altitudeM: null }

describe("buildStreams", () => {
  it("returns empty result for empty distance", () => {
    expect(buildStreams({ distanceM: [], heartrate: [100], ...base }, 190)).toEqual({
      points: [],
      hrZones: null,
      maxHrUsed: null,
    })
  })

  it("buckets zones at 60/70/80/90% of maxHr", () => {
    // maxHr 100: 59 z1, 60 z2, 70 z3, 80 z4, 90 z5
    const heartrate = [59, 60, 70, 80, 90]
    const r = buildStreams({ distanceM: [0, 1, 2, 3, 4], heartrate, ...base }, 100)
    expect(r.hrZones).toEqual({ zone1: 1, zone2: 1, zone3: 1, zone4: 1, zone5: 1 })
    expect(r.maxHrUsed).toBe(100)
  })

  it("derives maxHrUsed as round(max/0.95) when maxHr is null", () => {
    const r = buildStreams({ distanceM: [0, 1], heartrate: [100, 190], ...base }, null)
    expect(r.maxHrUsed).toBe(200)
  })

  it("downsamples to at most 500 points and converts units", () => {
    const n = 1999
    const r = buildStreams(
      {
        distanceM: Array.from({ length: n }, (_, i) => i * 10),
        heartrate: null,
        speedMs: Array.from({ length: n }, () => 10),
        altitudeM: null,
      },
      null
    )
    expect(r.points.length).toBeLessThanOrEqual(500)
    expect(r.points[1]?.distanceKm).toBe(0.04)
    expect(r.points[0]?.speedKmh).toBe(36)
    expect(r.hrZones).toBeNull()
  })

  it.each([501, 999])("keeps %i points within 500", (n) => {
    const r = buildStreams(
      { distanceM: Array.from({ length: n }, (_, i) => i), heartrate: null, ...base },
      null
    )
    expect(r.points.length).toBeLessThanOrEqual(500)
  })
})
