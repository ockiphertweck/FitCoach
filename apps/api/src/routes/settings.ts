import { and, eq } from "drizzle-orm"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { db } from "../db/index.js"
import { apiKeys, userProfiles } from "../db/schema.js"
import { authMiddleware } from "../middleware/auth.js"
import { encrypt } from "../services/encryption.js"

const settingsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", authMiddleware)

  fastify.get(
    "/settings/apikey",
    {
      schema: {
        response: {
          200: z.object({ providers: z.array(z.string()) }),
        },
      },
    },
    async (request) => {
      const keys = await db
        .select({ provider: apiKeys.provider })
        .from(apiKeys)
        .where(eq(apiKeys.userId, request.user.sub))

      return { providers: keys.map((k) => k.provider) }
    }
  )

  fastify.post(
    "/settings/apikey",
    {
      schema: {
        body: z.object({
          provider: z.string().min(1),
          key: z.string().min(1),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request) => {
      const { provider, key } = request.body
      const userId = request.user.sub
      const encryptedKey = encrypt(key)

      await db
        .insert(apiKeys)
        .values({ userId, provider, encryptedKey })
        .onConflictDoUpdate({
          target: [apiKeys.userId, apiKeys.provider],
          set: { encryptedKey },
        })

      return { ok: true }
    }
  )

  const profileSchema = z.object({
    sex: z.enum(["male", "female", "other"]).nullable(),
    weightKg: z.number().positive().nullable(),
    heightCm: z.number().positive().nullable(),
    maxHeartRate: z.number().int().positive().nullable(),
    ftpWatts: z.number().int().positive().nullable(),
  })

  fastify.get(
    "/settings/profile",
    { schema: { response: { 200: profileSchema } } },
    async (request) => {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, request.user.sub))
        .limit(1)

      return {
        sex: (profile?.sex as "male" | "female" | "other" | null) ?? null,
        weightKg: profile?.weightKg ?? null,
        heightCm: profile?.heightCm ?? null,
        maxHeartRate: profile?.maxHeartRate ?? null,
        ftpWatts: profile?.ftpWatts ?? null,
      }
    }
  )

  fastify.put(
    "/settings/profile",
    { schema: { body: profileSchema, response: { 200: z.object({ ok: z.boolean() }) } } },
    async (request) => {
      const userId = request.user.sub
      const values = { userId, ...request.body, updatedAt: new Date() }

      await db
        .insert(userProfiles)
        .values(values)
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: { ...request.body, updatedAt: new Date() },
        })

      return { ok: true }
    }
  )

  fastify.delete(
    "/settings/apikey/:provider",
    {
      schema: {
        params: z.object({ provider: z.string() }),
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (request) => {
      await db
        .delete(apiKeys)
        .where(
          and(eq(apiKeys.userId, request.user.sub), eq(apiKeys.provider, request.params.provider))
        )

      return { ok: true }
    }
  )
}

export default settingsRoutes
