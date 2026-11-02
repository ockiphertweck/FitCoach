import { describe, expect, it } from "vitest"
import type { DB } from "../db/index.js"
import type { Activity } from "../db/schema.js"
import type { RecapWellness } from "../services/wellness.js"
import { settledWellness } from "../services/wellness.js"
import { formatFormLabel, formatRecoverySection } from "./_format.js"
import { RECAP_SYSTEM_PROMPT } from "./recap-system.js"
import {
  buildRecapRequest,
  buildRecommendationPrompt,
  formatActivityLine,
} from "./recommendation.js"

const w: RecapWellness = {
  date: "2024-03-02",
  sleepScore: 81,
  sleepSeconds: 27000,
  deepSleepSeconds: 5000,
  remSleepSeconds: 6000,
  lightSleepSeconds: 14000,
  awakeSeconds: 2000,
  hrvLastNight: 61,
  hrvWeeklyAvg: 58,
  hrvStatus: "BALANCED",
  bodyBatteryCharged: 70,
  bodyBatteryAtWake: 85,
}

describe("buildRecapRequest", () => {
  it("is short and uses the German recap system prompt", () => {
    const r = buildRecapRequest("x")
    expect(r.max_tokens).toBe(300)
    expect(r.system).toBe(RECAP_SYSTEM_PROMPT)
    expect(r.model).toBe("claude-sonnet-4-6")
    expect(r.messages).toEqual([{ role: "user", content: "x" }])
  })
  it("system prompt fixes the output format", () => {
    expect(RECAP_SYSTEM_PROMPT).toContain("###")
    expect(RECAP_SYSTEM_PROMPT).toContain("→")
  })
})

describe("formatRecoverySection", () => {
  it("is empty without data", () => expect(formatRecoverySection([], "2024-03-02")).toEqual([]))
  it("lists sleep, HRV, Body Battery and a 7-day line", () => {
    const text = formatRecoverySection(
      [{ ...w, date: "2024-03-01", stressAvg: 33, restingHeartRate: 49 }, w],
      "2024-03-02"
    ).join("\n")
    expect(text).toContain("81")
    expect(text).toContain("HRV")
    expect(text).toContain("85")
    expect(text).toContain("33")
    expect(text).toContain("49")
    expect(text).not.toContain("rawData")
  })
})

describe("formatRecoverySection dates", () => {
  const dayBefore = { ...w, date: "2024-02-29", stressAvg: 55, restingHeartRate: 44 }
  it("has no Last night or Yesterday lines without today's row or a row for yesterday", () => {
    const t = formatRecoverySection([dayBefore], "2024-03-02").join("\n")
    expect(t).not.toContain("Last night")
    expect(t).not.toContain("Yesterday")
    expect(t).toContain("02-29")
  })
  it("handles a gap day: today present, yesterday missing", () => {
    const t = formatRecoverySection([dayBefore, w], "2024-03-02").join("\n")
    expect(t).toContain("Last night")
    expect(t).not.toContain("Yesterday")
  })
})

describe("buildRecommendationPrompt", () => {
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
    }),
  } as unknown as DB
  const base = { activities: [], profile: null }

  it("still builds without a today row", async () => {
    const p = await buildRecommendationPrompt("u", db, "2024-03-02", { ...base, wellness: [] })
    expect(p).toContain("Athlete Training Context")
    expect(p).not.toContain("Last night")
  })
  it("never leaks unknown keys of the wellness rows", async () => {
    const row = { ...w, rawData: { secret: "SECRETVALUE" }, bodyBatteryCurrent: 31337 }
    const p = await buildRecommendationPrompt("u", db, "2024-03-02", {
      ...base,
      wellness: settledWellness([row as never], "2024-03-02"),
    })
    expect(p).toContain("Last night")
    expect(p).not.toContain("SECRETVALUE")
    expect(p).not.toContain("rawData")
    expect(p).not.toContain("31337")
  })
})

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
