import { describe, expect, it } from "vitest"
import type { RecapWellness } from "../services/wellness.js"
import { formatRecoverySection } from "./_format.js"
import { RECAP_SYSTEM_PROMPT } from "./recap-system.js"
import { buildRecapRequest } from "./recommendation.js"

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
  it("is empty without data", () => expect(formatRecoverySection([])).toEqual([]))
  it("lists sleep, HRV, Body Battery and a 7-day line", () => {
    const text = formatRecoverySection([
      { ...w, date: "2024-03-01", stressAvg: 33, restingHeartRate: 49 },
      w,
    ]).join("\n")
    expect(text).toContain("81")
    expect(text).toContain("HRV")
    expect(text).toContain("85")
    expect(text).toContain("33")
    expect(text).toContain("49")
    expect(text).not.toContain("rawData")
  })
})
