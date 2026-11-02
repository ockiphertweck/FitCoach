import { describe, expect, it } from "vitest"
import type { Activity } from "../db/schema.js"
import { formatFormLabel } from "./_format.js"
import { formatActivityLine } from "./recommendation.js"

describe("formatFormLabel", () => {
  it("labels TSB boundaries", () => {
    expect(formatFormLabel(5.1)).toBe("(fresh)")
    expect(formatFormLabel(5)).toBe("(moderate)")
    expect(formatFormLabel(-10)).toBe("(moderate)")
    expect(formatFormLabel(-10.1)).toBe("(fatigued)")
  })
})

describe("formatActivityLine", () => {
  const startDate = new Date("2024-03-01T07:00:00Z")

  it("includes every present field in order", () => {
    const a = {
      startDate,
      sportType: "run",
      name: "Tempo",
      durationSeconds: 3660,
      distanceMeters: 10000,
      averageHeartRate: 150,
      averagePaceSecondsPerKm: 305,
      perceivedExertion: 7,
    } as Activity
    expect(formatActivityLine(a)).toBe(
      '- 2024-03-01 | run | "Tempo" | 1h 1m | 10.0 km | avg HR: 150 bpm | 5:05/km | RPE: 7/10'
    )
  })

  it("omits missing fields", () => {
    expect(formatActivityLine({ startDate, sportType: "ride" } as Activity)).toBe(
      "- 2024-03-01 | ride"
    )
  })
})
