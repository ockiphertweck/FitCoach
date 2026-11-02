import Fastify from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ upsertRecap: vi.fn(), create: vi.fn() }))

vi.mock("../db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [], orderBy: async () => [] }) }),
    }),
  },
}))
vi.mock("../env.js", () => ({ env: { FRONTEND_URL: "http://localhost:3001" } }))
vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (req: { user: unknown }) => {
    req.user = { sub: "u1", email: "a@b.c" }
  },
}))
vi.mock("../services/anthropic-client.js", () => ({
  hasAnthropicKey: async () => true,
  requireAnthropicClient: async () => ({ messages: { create: h.create } }),
}))
vi.mock("../prompts/recommendation.js", async (orig) => ({
  ...(await orig<object>()),
  buildRecommendationPrompt: async () => "prompt",
}))
vi.mock("../services/daily-recap.js", async (orig) => ({
  ...(await orig<object>()),
  loadRecapInputs: async () => ({ activities: [], profile: null, wellness: [] }),
  upsertRecap: h.upsertRecap,
}))

import aiRoutes from "./ai.js"

async function app() {
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  await f.register(aiRoutes)
  return f
}

const post = async (url: string, payload: object) =>
  (await app()).inject({ method: "POST", url, payload })

const oneDelta = () =>
  (async function* () {
    yield { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } }
  })()

describe("ai routes language", () => {
  beforeEach(() => {
    h.upsertRecap.mockReset()
    h.create.mockReset()
  })

  it("rejects an unknown lang on recommendation and weekly-report", async () => {
    expect((await post("/ai/recommendation", { date: "2024-03-02", lang: "fr" })).statusCode).toBe(
      400
    )
    expect((await post("/ai/weekly-report", { lang: "fr" })).statusCode).toBe(400)
  })

  it("activity-insight works without lang (defaults)", async () => {
    const res = await post("/ai/activity-insight", {
      activityId: "00000000-0000-4000-8000-000000000000",
    })
    expect(res.statusCode).toBe(404)
  })

  it("recap input hash does not depend on lang", async () => {
    const hashes: string[] = []
    for (const lang of ["de", "en"]) {
      h.create.mockResolvedValueOnce(oneDelta())
      const res = await post("/ai/recommendation", { date: "2024-03-02", lang })
      expect(res.statusCode).toBe(200)
      hashes.push(h.upsertRecap.mock.calls.at(-1)?.[1].inputHash)
    }
    expect(h.upsertRecap).toHaveBeenCalledTimes(2)
    expect(hashes[0]).toBeTruthy()
    expect(hashes[0]).toBe(hashes[1])
  })
})
