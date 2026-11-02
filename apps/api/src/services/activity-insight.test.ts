import { describe, expect, it } from "vitest"
import type { Activity } from "../db/schema.js"
import { buildActivityInsightPrompt } from "../prompts/activity-insight.js"
import { computeInsightHash } from "./activity-insight.js"

const act = (rawData: Record<string, unknown>) =>
  ({ sportType: "Ride", startDate: new Date("2026-01-01"), rawData }) as unknown as Activity

describe("computeInsightHash (Garmin fields)", () => {
  it("changes when avgPower changes", () => {
    expect(computeInsightHash(act({ avgPower: 200 }))).not.toBe(
      computeInsightHash(act({ avgPower: 210 }))
    )
  })
  it("ignores unrelated raw keys", () => {
    expect(computeInsightHash(act({ avgPower: 200, ownerFullName: "a" }))).toBe(
      computeInsightHash(act({ avgPower: 200, ownerFullName: "b" }))
    )
  })
})

describe("buildActivityInsightPrompt (Garmin fields)", () => {
  it("includes only the specific formatted fields, not rawData wholesale", () => {
    const p = buildActivityInsightPrompt(
      act({ avgPower: 200, normPower: 220, aerobicTrainingEffect: 3.2, ownerFullName: "Secret" }),
      null
    )
    expect(p).toContain("Avg Power: 200 W")
    expect(p).toContain("Normalized Power: 220 W")
    expect(p).toContain("Aerobic Training Effect: 3.2")
    expect(p).not.toContain("Secret")
  })
})
