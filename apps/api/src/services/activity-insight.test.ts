import type { Anthropic } from "@posthog/ai"
import { describe, expect, it, vi } from "vitest"
import type { Activity } from "../db/schema.js"
import { buildActivityInsightPrompt } from "../prompts/activity-insight.js"
import { computeInsightHash, generateActivityInsight } from "./activity-insight.js"

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
  it("skips non-numeric raw values instead of printing them", () => {
    const p = buildActivityInsightPrompt(
      act({ avgPower: { v: 1 }, normPower: "220", anaerobicTrainingEffect: [2] }),
      null
    )
    expect(p).not.toContain("Power")
    expect(p).not.toContain("Training Effect")
    expect(p).not.toContain("[object Object]")
  })
})

describe("generateActivityInsight language", () => {
  it("passes the language instruction in the system prompt", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] })
    const mock = { messages: { create } } as unknown as Anthropic
    await generateActivityInsight(mock, act({}), null, "u1", "de")
    expect(create.mock.calls[0][0].system.endsWith("Antworte immer auf Deutsch.")).toBe(true)
  })
})
