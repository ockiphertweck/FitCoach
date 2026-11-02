import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { db } from "../db/index.js"
import type { DailyWellness } from "../db/schema.js"
import { authMiddleware } from "../middleware/auth.js"
import { recapDateSchema } from "../services/daily-recap.js"
import { loadWellness } from "../services/wellness.js"

type WellnessDay = Omit<DailyWellness, "id" | "userId" | "updatedAt">

const toDay = ({ id: _i, userId: _u, updatedAt: _t, ...day }: DailyWellness): WellnessDay => day

const wellnessRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", authMiddleware)

  fastify.get("/wellness", { schema: { querystring: recapDateSchema } }, async (request) => {
    const { date } = request.query
    const days = (await loadWellness(db, request.user.sub, date)).map(toDay)
    return { today: days.find((d) => d.date === date) ?? null, days }
  })
}

export default wellnessRoutes
