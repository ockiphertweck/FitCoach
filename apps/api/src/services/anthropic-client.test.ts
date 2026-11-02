import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ rows: [] as unknown[], envKey: undefined as string | undefined }))

vi.mock("../db/index.js", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => state.rows }) }) }) },
}))
vi.mock("../env.js", () => ({
  env: {
    get CLAUDE_API_KEY() {
      return state.envKey
    },
  },
}))
vi.mock("./posthog.js", () => ({ posthog: {} }))
vi.mock("./encryption.js", () => ({ decrypt: vi.fn() }))
vi.mock("@posthog/ai", () => ({ Anthropic: class {} }))

import { hasAnthropicKey } from "./anthropic-client.js"

describe("hasAnthropicKey", () => {
  beforeEach(() => {
    state.rows = []
    state.envKey = undefined
  })
  it("is false with no row and no env key", async () => {
    expect(await hasAnthropicKey("u")).toBe(false)
  })
  it("is true with a stored row", async () => {
    state.rows = [{ id: "1" }]
    expect(await hasAnthropicKey("u")).toBe(true)
  })
  it("is true with only an env key", async () => {
    state.envKey = "k"
    expect(await hasAnthropicKey("u")).toBe(true)
  })
})
