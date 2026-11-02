import { getTableName } from "drizzle-orm"
import Fastify from "fastify"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GarminError } from "../services/garmin/client.js"

const h = vi.hoisted(() => ({
  deleted: [] as string[],
  selectRows: [] as unknown[],
  exchange: vi.fn(),
}))

vi.mock("../db/index.js", () => {
  const del = (t: Parameters<typeof getTableName>[0]) => {
    h.deleted.push(getTableName(t))
    return { where: async () => [] }
  }
  const db = {
    select: () => ({ from: () => ({ where: async () => h.selectRows }) }),
    delete: del,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ delete: del }),
  }
  return { db }
})
vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (req: { user: unknown }) => {
    req.user = { sub: "u1", email: "a@b.c" }
  },
}))
vi.mock("../services/garmin/client.js", async (orig) => ({
  ...(await orig<typeof import("../services/garmin/client.js")>()),
  exchangeKey: h.exchange,
}))

import garminRoutes from "./garmin.js"

async function app() {
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  await f.register(garminRoutes)
  return f
}

describe("garmin routes", () => {
  beforeEach(() => {
    h.deleted.length = 0
    h.selectRows = []
    h.exchange.mockReset()
  })

  it("connect with a rejected key -> 400 key_invalid", async () => {
    h.exchange.mockImplementation(async () => {
      throw new GarminError("key_invalid", "x")
    })
    const res = await (await app()).inject({
      method: "POST",
      url: "/garmin/connect",
      payload: { key: "0123456789abc" },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: "key_invalid" })
  })

  it("sync when not connected -> 400, also with no body", async () => {
    const res = await (await app()).inject({ method: "POST", url: "/garmin/sync" })
    expect(res.statusCode).toBe(400)
  })

  it("DELETE /garmin/key removes key + sync row only", async () => {
    const res = await (await app()).inject({ method: "DELETE", url: "/garmin/key" })
    expect(res.statusCode).toBe(200)
    expect(h.deleted.sort()).toEqual(["api_keys", "garmin_sync"])
  })
})
