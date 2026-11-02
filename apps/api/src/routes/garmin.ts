import { and, eq } from "drizzle-orm"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { db } from "../db/index.js"
import { apiKeys, garminSync } from "../db/schema.js"
import { authMiddleware } from "../middleware/auth.js"
import { encrypt } from "../services/encryption.js"
import { GarminError, exchangeKey } from "../services/garmin/client.js"
import {
  garminStatusSchema,
  getGarminStatus,
  runGarminSync,
  syncIfDue,
  withUserLock,
} from "../services/garmin/sync.js"

const errorSchema = z.object({ error: z.string() })

const garminRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", authMiddleware)

  fastify.post(
    "/garmin/connect",
    {
      schema: {
        body: z.object({ key: z.string().trim().min(10).max(4000) }),
        response: { 200: garminStatusSchema, 400: errorSchema, 502: errorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { key } = request.body
      let keyExpiresAt: Date | null
      try {
        ;({ keyExpiresAt } = await exchangeKey(key))
      } catch (e) {
        if (e instanceof GarminError && e.code === "key_invalid")
          return reply.code(400).send({ error: "key_invalid" })
        return reply
          .code(502)
          .send({ error: e instanceof GarminError ? e.code : "garmin_unavailable" })
      }
      const encryptedKey = encrypt(key)
      await db
        .insert(apiKeys)
        .values({ userId, provider: "garmin", encryptedKey })
        .onConflictDoUpdate({ target: [apiKeys.userId, apiKeys.provider], set: { encryptedKey } })
      await db
        .insert(garminSync)
        .values({ userId, status: "importing", keyExpiresAt })
        .onConflictDoUpdate({
          target: garminSync.userId,
          set: { status: "importing", lastError: null, keyExpiresAt, updatedAt: new Date() },
        })
      // Fire-and-forget: runGarminSync records its own failures in garmin_sync.
      void withUserLock(userId, () => runGarminSync(db, userId, { initial: true })).catch(() =>
        request.log.error({ userId, code: "sync_crashed" })
      )
      return getGarminStatus(db, userId)
    }
  )

  fastify.get(
    "/garmin/status",
    { schema: { response: { 200: garminStatusSchema } } },
    async (request) => getGarminStatus(db, request.user.sub)
  )

  fastify.post(
    "/garmin/sync",
    {
      schema: {
        body: z.object({ force: z.boolean().default(false) }),
        response: { 200: garminStatusSchema, 400: errorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const current = await getGarminStatus(db, userId)
      if (!current.connected) return reply.code(400).send({ error: "not_connected" })
      return syncIfDue(db, userId, request.body.force)
    }
  )

  fastify.delete(
    "/garmin/key",
    { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
    async (request) => {
      const userId = request.user.sub
      await db.transaction(async (tx) => {
        await tx
          .delete(apiKeys)
          .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, "garmin")))
        await tx.delete(garminSync).where(eq(garminSync.userId, userId))
      })
      return { ok: true }
    }
  )
}

export default garminRoutes
