import Fastify from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ rows: [] as unknown[] }))

vi.mock("../db/index.js", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => h.rows }) }) }) },
}))
vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (req: { user: unknown }) => {
    req.user = { sub: "u1", email: "a@b.c" }
  },
}))

import wellnessRoutes from "./wellness.js"

async function app() {
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  await f.register(wellnessRoutes)
  return f
}

describe("GET /wellness", () => {
  beforeEach(() => {
    h.rows = []
  })

  it("returns today and days without id/userId/updatedAt", async () => {
    h.rows = [
      { id: "1", userId: "u1", date: "2024-03-01", sleepScore: 70, updatedAt: new Date() },
      { id: "2", userId: "u1", date: "2024-03-02", sleepScore: 80, updatedAt: new Date() },
    ]
    const res = await (await app()).inject({ url: "/wellness?date=2024-03-02" })
    const body = res.json()
    expect(res.statusCode).toBe(200)
    expect(body.days).toHaveLength(2)
    expect(body.today.sleepScore).toBe(80)
    expect(body.today).not.toHaveProperty("id")
    expect(body.today).not.toHaveProperty("userId")
    expect(body.today).not.toHaveProperty("updatedAt")
  })

  it("today is null when there is no row for the date", async () => {
    const body = (await (await app()).inject({ url: "/wellness?date=2024-03-02" })).json()
    expect(body).toEqual({ today: null, days: [] })
  })

  it("rejects an invalid date", async () => {
    expect((await (await app()).inject({ url: "/wellness?date=nope" })).statusCode).toBe(400)
  })
})
